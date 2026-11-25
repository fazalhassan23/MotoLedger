[CmdletBinding()]
param(
    [string]$Jdk = $env:JAVA_HOME,
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$BuildTools,
    [string]$PlatformJar,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'release')
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if (!$BuildTools) { $BuildTools = Join-Path $Sdk 'build-tools/35.0.0' }
if (!$PlatformJar) { $PlatformJar = Join-Path $Sdk 'platforms/android-35/android.jar' }
$env:JAVA_HOME = $Jdk
$stage = New-Item -ItemType Directory (Join-Path ([IO.Path]::GetTempPath()) ('motorledger-build-' + [guid]::NewGuid()))
$assets = New-Item -ItemType Directory "$stage/assets"
$classes = New-Item -ItemType Directory "$stage/classes"
$dex = New-Item -ItemType Directory "$stage/dex"
Copy-Item "$PSScriptRoot/../dist/*" $assets
Copy-Item "$PSScriptRoot/assets/*" $assets
$index = [IO.File]::ReadAllText("$assets/index.html").Replace('</head>', '<link rel="stylesheet" href="phone.css"><script defer src="phone.js"></script></head>')
[IO.File]::WriteAllText("$assets/index.html", $index)
& "$BuildTools/aapt2.exe" compile --dir "$PSScriptRoot/res" -o "$stage/resources.zip"
& "$BuildTools/aapt2.exe" link -o "$stage/base.apk" --manifest "$PSScriptRoot/AndroidManifest.xml" -I $PlatformJar -A $assets "$stage/resources.zip"
$sources = (Get-ChildItem "$PSScriptRoot/src/*.java").FullName
& "$Jdk/bin/javac.exe" -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PlatformJar;$BuildTools/core-lambda-stubs.jar" -d $classes @sources
& "$Jdk/bin/jar.exe" cf "$stage/classes.jar" -C $classes .
& "$Jdk/bin/java.exe" -cp "$BuildTools/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 28 --lib $PlatformJar --output $dex "$stage/classes.jar"
& "$Jdk/bin/jar.exe" uf "$stage/base.apk" -C $dex classes.dex
& "$BuildTools/zipalign.exe" -P 16 -f 4 "$stage/base.apk" "$stage/aligned.apk"

# Keep the signing identity outside the source tree. DPAPI binds the password to this Windows user.
$keyDir = New-Item -Force -ItemType Directory "$env:LOCALAPPDATA/MotorledgerSigning"
$keyFile = Join-Path $keyDir 'motorledger-release.p12'
$secretFile = Join-Path $keyDir 'password.dpapi'
if (!(Test-Path $secretFile)) {
    if (Test-Path $keyFile) { throw 'Signing password missing. Restore the original signing materials.' }
    $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(36)
    ConvertTo-SecureString ([Convert]::ToBase64String($random)) -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $secretFile
}
$secret = Get-Content $secretFile | ConvertTo-SecureString
$env:MOTORLEDGER_KEY_PASS = [Net.NetworkCredential]::new('', $secret).Password
try {
    if (!(Test-Path $keyFile)) {
        & "$Jdk/bin/keytool.exe" -genkeypair -keystore $keyFile -storetype PKCS12 -storepass:env MOTORLEDGER_KEY_PASS -keypass:env MOTORLEDGER_KEY_PASS -alias motorledger -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Motorledger Android'
    }
    $out = New-Item -Force -ItemType Directory $OutputDirectory
    $apk = Join-Path $out 'Motorledger-1.0.0.apk'
    & "$Jdk/bin/java.exe" -jar "$BuildTools/lib/apksigner.jar" sign --ks $keyFile --ks-key-alias motorledger --ks-pass env:MOTORLEDGER_KEY_PASS --v4-signing-enabled false --out $apk "$stage/aligned.apk"
    & "$Jdk/bin/java.exe" -jar "$BuildTools/lib/apksigner.jar" verify --verbose --print-certs $apk
    & "$BuildTools/zipalign.exe" -c -P 16 4 $apk
    Get-FileHash $apk
} finally { Remove-Item Env:MOTORLEDGER_KEY_PASS -ErrorAction SilentlyContinue }


