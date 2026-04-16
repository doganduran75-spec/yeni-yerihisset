$p = 'src\app\products\[slug]\page.tsx'
$c = Get-Content -LiteralPath $p -Encoding Default
# Filter variants in list
$c = $c -replace 'product\.product_variants\.map\(', 'product.product_variants.filter(v => v.is_active).map('
# Default variant selection logic
$c = $c -replace 'if \(data\.product_variants && data\.product_variants\.length > 0\) \{', 'const activeV = data.product_variants?.filter(v => v.is_active) || []; if (activeV.length > 0) {'
$c = $c -replace 'setSelectedVariant\(data\.product_variants\[0\]\);', 'setSelectedVariant(activeV[0]);'
# Description tag change
$c = $c -replace '<p className="text-slate-600 leading-relaxed whitespace-pre-wrap">', '<div className="text-slate-600 leading-relaxed whitespace-pre-wrap">'
$c = $c -replace '</p>', '</div>'
$c | Set-Content -LiteralPath $p -Encoding Default
