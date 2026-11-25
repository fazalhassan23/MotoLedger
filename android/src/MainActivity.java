package app.motorledger.garage;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private WebView reportView;
    private TripRecorder.Store trips;
    private boolean ready;
    private String pendingVehicle, pendingImport, action;
    private File export;
    private static final String ORIGIN="https://appassets.androidplatform.net/";
    private static final int PICK=41, SAVE=42, GPS=43;
    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        trips=new TripRecorder.Store(this);
        action=getIntent().getAction();
        if(state!=null) {pendingVehicle=state.getString("vehicle");pendingImport=state.getString("import");String f=state.getString("export");if(f!=null)export=new File(getCacheDir(),f);}
        web=new WebView(this);web.setBackgroundColor(Color.rgb(246,247,245));
        LinearLayout root=new LinearLayout(this);root.setBackgroundColor(Color.WHITE);
        getWindow().setStatusBarColor(Color.WHITE);getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets pad=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
                v.setPadding(pad.left,pad.top,pad.right,pad.bottom);return insets;
            });
        }
        root.addView(web,-1,-1);setContentView(root);
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                Uri u=r.getUrl();String path=u.getPath();if("https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())&&path!=null&&path.matches("/[A-Za-z0-9_.-]+")){
                    String n=path.substring(1);
                    try{String mime=n.endsWith(".js")?"text/javascript":n.endsWith(".css")?"text/css":n.endsWith(".png")?"image/png":n.endsWith(".svg")?"image/svg+xml":n.endsWith(".html")?"text/html":"text/plain";
                        return new WebResourceResponse(mime,"UTF-8",getAssets().open(n));}catch(IOException ignored){}
                }
                return new WebResourceResponse("text/plain","UTF-8",404,"Missing",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView v,String url){ready=true;launchAction();}
        });
        web.addJavascriptInterface(new Bridge(),"Handset");web.loadUrl(ORIGIN+"index.html");
    }
    @Override public void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);state.putString("vehicle",pendingVehicle);state.putString("import",pendingImport);if(export!=null)state.putString("export",export.getName());}
    @Override public void onNewIntent(Intent i){super.onNewIntent(i);setIntent(i);action=i.getAction();launchAction();}
    void launchAction(){
        if(!ready)return;if("app.motorledger.garage.FILL".equals(action))js("entry()");
        if("app.motorledger.garage.TRIPS".equals(action))js("location.hash='Trip%20planner'");
        action=null;
    }
    void js(String code){web.evaluateJavascript(code,null);}
    void message(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    public class Bridge{
        @JavascriptInterface public void calendar(String name,String day){runOnUiThread(()->{
            try {
                long start=java.time.LocalDate.parse(day).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
                Intent event=new Intent(Intent.ACTION_INSERT,android.provider.CalendarContract.Events.CONTENT_URI)
                    .putExtra(android.provider.CalendarContract.Events.TITLE,name)
                    .putExtra(android.provider.CalendarContract.EXTRA_EVENT_ALL_DAY,true)
                    .putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME,start)
                    .putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME,start+86400000);
                startActivity(event);
            }catch(Exception e){message("No calendar app could open this event.");}
        });}
        @JavascriptInterface public void printReport(String html){runOnUiThread(()->{
            if(reportView!=null)reportView.destroy();
            reportView=new WebView(MainActivity.this);
            reportView.getSettings().setAllowFileAccess(false);
            reportView.getSettings().setAllowContentAccess(false);
            reportView.setWebViewClient(new WebViewClient(){
                @Override public void onPageFinished(WebView v,String url){
                    android.print.PrintManager printer=(android.print.PrintManager)getSystemService(PRINT_SERVICE);
                    printer.print("Motorledger vehicle report",v.createPrintDocumentAdapter("Vehicle report"),null);
                }
            });
            reportView.loadDataWithBaseURL(null,html,"text/html","UTF-8",null);
        });}
        @JavascriptInterface public String tripState(boolean points){return trips.state(points).toString();}
        @JavascriptInterface public void startTrip(String vehicle){runOnUiThread(()->{
            if(trips.state(false).length()>0){message("Finish or save the current drive first.");return;}
            pendingVehicle=vehicle;
            if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},GPS);return;}
            record();
        });}
        @JavascriptInterface public void stopTrip(){runOnUiThread(()->startService(new Intent(MainActivity.this,TripRecorder.class).setAction(TripRecorder.STOP)));}
        @JavascriptInterface public void clearTrip(String id){trips.clear(id);}
        @JavascriptInterface public void selectDocument(String kind){runOnUiThread(()->{
            if(!"file".equals(kind)&&!"fuelioFile".equals(kind))return;pendingImport=kind;
            Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");startActivityForResult(pick,PICK);
        });}
        @JavascriptInterface public void saveDocument(String name,String data,String mime){runOnUiThread(()->{
            try{if(export!=null){message("Finish the current export first.");return;}
                export=File.createTempFile("ledger-",".tmp",getCacheDir());try(FileOutputStream f=new FileOutputStream(export)){f.write(data.getBytes(StandardCharsets.UTF_8));}
                Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(save,SAVE);
            }catch(Exception e){clearExport();message("Could not prepare export.");}
        });}
    }
    void record(){
        String vehicle=pendingVehicle;pendingVehicle=null;if(vehicle==null)return;
        if(!getSystemService(LocationManager.class).isProviderEnabled(LocationManager.GPS_PROVIDER)){message("Turn on device location to record a GPS trip.");return;}
        startForegroundService(new Intent(this,TripRecorder.class).setAction(TripRecorder.START).putExtra("vehicle",vehicle));
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},44);
    }
    @Override public void onRequestPermissionsResult(int rc,String[] permissions,int[] results){super.onRequestPermissionsResult(rc,permissions,results);if(rc==GPS){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)record();else {pendingVehicle=null;message("GPS recording needs precise location. Manual trip entry is available.");}}}
    void clearExport(){if(export!=null){export.delete();export=null;}}
    @Override public void onActivityResult(int rc,int result,Intent data){
        super.onActivityResult(rc,result,data);
        if(rc==SAVE){try{if(result==RESULT_OK && data!=null && data.getData()!=null && export!=null){
            try(InputStream in=new FileInputStream(export);OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new IOException();byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}message("File saved.");
        }}catch(Exception e){message("Could not save the file.");}finally{clearExport();}return;}
        if(rc!=PICK||result!=RESULT_OK||data==null||data.getData()==null||pendingImport==null)return;
        String target=pendingImport;pendingImport=null;
        try(InputStream in=getContentResolver().openInputStream(data.getData());ByteArrayOutputStream out=new ByteArrayOutputStream()){
            if(in==null)throw new IOException();byte[] buf=new byte[16384];int n,max="file".equals(target)?10000000:5000000;
            while((n=in.read(buf))!=-1){if(out.size()+n>max)throw new IOException("File too large");out.write(buf,0,n);}
            js("receiveAndroidFile("+JSONObject.quote(target)+","+JSONObject.quote(out.toString("UTF-8"))+")");
        }catch(Exception e){message("Could not read this file. Check its size and availability.");}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("phoneBack()",result->{if(!"true".equals(result))super.onBackPressed();});}
    @Override public void onDestroy(){if(reportView!=null)reportView.destroy();web.removeJavascriptInterface("Handset");web.destroy();trips.close();super.onDestroy();}
}
