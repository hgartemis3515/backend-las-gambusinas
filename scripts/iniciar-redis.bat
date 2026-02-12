@echo off
REM Script simple para iniciar Redis/Memurai manualmente si es necesario
echo Iniciando Redis/Memurai...

if exist "C:\Program Files\Memurai\memurai.exe" (
    echo Memurai encontrado. Iniciando...
    start /B "" "C:\Program Files\Memurai\memurai.exe"
    timeout /t 3 /nobreak >nul
    
    echo Verificando conexion...
    "C:\Program Files\Memurai\memurai-cli.exe" ping
    
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo Redis/Memurai esta corriendo correctamente!
    ) else (
        echo Redis iniciado pero aun no responde. Espera unos segundos.
    )
) else (
    echo ERROR: Memurai no encontrado en C:\Program Files\Memurai
    echo Verifica la instalacion.
)

pause

