@echo off
echo ---- %date% %time% ---- >> "C:\Users\lobet\Documents\Skinlab\scripts\sync.log"
"C:\Program Files\nodejs\node.exe" "C:\Users\lobet\Documents\Skinlab\scripts\sync-catalog.js" >> "C:\Users\lobet\Documents\Skinlab\scripts\sync.log" 2>&1