$ErrorActionPreference = 'Continue'
$log = Join-Path $env:TEMP 'gambusinas-rendimiento.txt'
Add-MpPreference -ExclusionPath 'c:\Users\W11\Desktop\GAMBUSINAS\backend-LasGambusinas\data'
Add-MpPreference -ExclusionProcess 'node.exe'
Add-MpPreference -ExclusionProcess 'mongod.exe'
$eth = Get-NetIPInterface -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Ethernet 2' }
if ($eth) { Set-NetIPInterface -InterfaceAlias 'Ethernet 2' -InterfaceMetric 10 }
$vpn = Get-NetIPInterface -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Radmin VPN' }
if ($vpn) { Set-NetIPInterface -InterfaceAlias 'Radmin VPN' -InterfaceMetric 50 }
$p = Get-MpPreference
$n = Get-NetIPInterface -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Radmin|Ethernet 2' }
@(
  'PATHS'
  ($p.ExclusionPath -join ' | ')
  'PROCS'
  ($p.ExclusionProcess -join ' | ')
  'METRICS'
  (($n | ForEach-Object { $_.InterfaceAlias + '=' + $_.InterfaceMetric }) -join ' | ')
) | Set-Content -Encoding utf8 $log
