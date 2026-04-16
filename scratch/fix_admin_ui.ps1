$p = 'src\app\admin\products\page.tsx'
$c = Get-Content $p -Encoding Default
$c = $c -replace 'max-w-\[95vw\] md:max-w-5xl h-\[95vh\]', 'max-w-none w-screen h-screen rounded-none'
$c = $c -replace 'min-h-\[250px\]', 'min-h-[500px]'
$c | Set-Content $p -Encoding Default
