; Instalador de Windows (Inno Setup 6). Lo compila CI:
;   iscc /DVersion=1.0.0 empaquetado\windows\instalador.iss
; Empaqueta la carpeta que genera PyInstaller (dist\SIMA Anonimizador).
; Instalación por usuario (sin pedir permisos de administrador).

#ifndef Version
  #define Version "1.0.0"
#endif
#define Nombre "SIMA Anonimizador"
#define Ejecutable "SIMA Anonimizador.exe"

[Setup]
AppId={{7E2C1F5A-6B3D-4C8E-9A1F-5D2B8C4E6A13}
AppName={#Nombre}
AppVersion={#Version}
AppPublisher=SimaHealth
DefaultDirName={localappdata}\Programs\{#Nombre}
DefaultGroupName={#Nombre}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=SIMA-Anonimizador-{#Version}-Windows-instalador
SetupIconFile=..\iconos\app.ico
UninstallDisplayIcon={app}\{#Ejecutable}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "..\..\dist\{#Nombre}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#Nombre}"; Filename: "{app}\{#Ejecutable}"
Name: "{autodesktop}\{#Nombre}"; Filename: "{app}\{#Ejecutable}"; Tasks: escritorio

[Run]
Filename: "{app}\{#Ejecutable}"; Description: "Abrir {#Nombre}"; Flags: nowait postinstall skipifsilent
