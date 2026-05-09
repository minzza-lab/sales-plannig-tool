Set WshShell = CreateObject("WScript.Shell")
' 0 옵션은 CMD 창을 완전히 숨김(Hidden) 처리합니다.
WshShell.Run chr(34) & "C:\Users\aasw\.gemini\antigravity\scratch\sales-plannig-tool\run_crawler.bat" & Chr(34), 0
Set WshShell = Nothing
