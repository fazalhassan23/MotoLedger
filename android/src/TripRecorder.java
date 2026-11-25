package app.motorledger.garage;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.*;
import android.location.*;
import android.os.*;
import org.json.*;

public class TripRecorder extends Service implements LocationListener {
    static final String CHANNEL = "motorledger_drives";
    static final String START = "record", STOP = "finish";
    private LocationManager manager;
    private Store store;

    static class Store extends SQLiteOpenHelper {
        Store(Context c) { super(c, "trip-recorder.db", null, 1); }
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE drive (id TEXT PRIMARY KEY, vehicle TEXT, started INTEGER, ended INTEGER, status TEXT)");
            db.execSQL("CREATE TABLE fix (id INTEGER PRIMARY KEY, stamp INTEGER, lat REAL, lon REAL, metres REAL)");
        }
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}
        JSONObject state(boolean route) {
            JSONObject out = new JSONObject();
            try (Cursor d = getReadableDatabase().rawQuery("SELECT * FROM drive", null)) {
                if (!d.moveToFirst()) return out;
                out.put("id",d.getString(0)).put("vehicle",d.getString(1)).put("started",d.getLong(2)).put("ended",d.getLong(3)).put("status",d.getString(4));
                try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*),MAX(metres) FROM fix",null)) {
                    c.moveToFirst(); out.put("fixes",c.getInt(0)).put("metres",c.getDouble(1));
                }
                if (route) {
                    JSONArray points=new JSONArray();
                    try (Cursor c=getReadableDatabase().rawQuery("SELECT stamp,lat,lon FROM fix ORDER BY id",null)) {
                        while(c.moveToNext()) points.put(new JSONArray().put(c.getLong(0)).put(c.getDouble(1)).put(c.getDouble(2)));
                    }
                    out.put("points",points);
                }
            } catch(JSONException e) { throw new IllegalStateException(e); }
            return out;
        }
        void clear(String id) {
            SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
            try { if(db.delete("drive","id=? AND status='finished'",new String[]{id})>0) db.delete("fix",null,null); db.setTransactionSuccessful(); } finally {db.endTransaction();}
        }
    }

    @Override public void onCreate() {
        super.onCreate(); store=new Store(this); manager=(LocationManager)getSystemService(LOCATION_SERVICE);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"GPS trips",NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(intent!=null && STOP.equals(intent.getAction())) {finishDrive();return START_NOT_STICKY;}
        Intent show=new Intent(this,MainActivity.class).setAction("app.motorledger.garage.TRIPS");
        PendingIntent open=PendingIntent.getActivity(this,1,show,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent end=PendingIntent.getService(this,2,new Intent(this,TripRecorder.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE);
        Notification note=new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Recording your drive").setContentText("Open Motorledger to review your trip.").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Finish",end).build()).build();
        if(checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){finishDrive();return START_NOT_STICKY;}
        try {
            startForeground(42,note);
            JSONObject active=store.state(false);
            if(active.length()==0 && intent!=null && intent.hasExtra("vehicle")) {
                store.getWritableDatabase().execSQL("INSERT INTO drive VALUES(?,?,?,0,'recording')",new Object[]{java.util.UUID.randomUUID().toString(),intent.getStringExtra("vehicle"),System.currentTimeMillis()});
            } else if(!"recording".equals(active.optString("status"))) {stopSelf();return START_NOT_STICKY;}
            manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,3000,5,this);
        } catch(RuntimeException e){finishDrive();return START_NOT_STICKY;}
        return START_STICKY;
    }
    public void onLocationChanged(Location point) {
        if (!point.hasAccuracy() || point.getAccuracy()>65 || !Double.isFinite(point.getLatitude()) || !Double.isFinite(point.getLongitude())) return;
        SQLiteDatabase db=store.getWritableDatabase();double total=0;
        try(Cursor last=db.rawQuery("SELECT stamp,lat,lon,metres FROM fix ORDER BY id DESC LIMIT 1",null)){
            if(last.moveToFirst()){
                long delta=point.getTime()-last.getLong(0);if(delta<=0)return;
                float[] distance=new float[1];Location.distanceBetween(last.getDouble(1),last.getDouble(2),point.getLatitude(),point.getLongitude(),distance);
                if(delta<120000 && (distance[0]<5 || distance[0]/(delta/1000.0)>90))return;
                total=last.getDouble(3)+(delta<120000?distance[0]:0);
            }
        }
        db.execSQL("INSERT INTO fix(stamp,lat,lon,metres) VALUES(?,?,?,?)",new Object[]{point.getTime(),point.getLatitude(),point.getLongitude(),total});
    }
    private void finishDrive(){store.getWritableDatabase().execSQL("UPDATE drive SET ended=?,status='finished' WHERE status='recording'",new Object[]{System.currentTimeMillis()});stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    public void onProviderDisabled(String provider){if(LocationManager.GPS_PROVIDER.equals(provider))finishDrive();}
    public void onProviderEnabled(String provider){}
    public void onStatusChanged(String provider,int status,Bundle extras){}
    public void onDestroy(){manager.removeUpdates(this);store.close();super.onDestroy();}
    public IBinder onBind(Intent intent){return null;}
}
