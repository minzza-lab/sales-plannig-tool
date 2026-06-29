Set WshShell = CreateObject("WScript.Shell")
currentPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptPosition)
' 0 옵션은 CMD 창을 완전히 숨김(Hidden) 처리합니다.
WshShell.Run chr(34) & currentPath & "\run_season_pass_crawler.bat" & Chr(34), 0
Set WshShell = Nothing
