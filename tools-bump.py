# يحدّث رقم النسخة في كل روابط الملفات عشان المتصفح ما يستعملش نسخة قديمة
import re, sys, time
V = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%Y%m%d%H%M')
files = ['index.html', 'admin.html', 'assets/js/store.js', 'assets/js/admin.js', 'assets/js/core.js']
for f in files:
    s = open(f).read()
    s = re.sub(r"(from '\./(?:core|icons|config)\.js)(?:\?v=[\w]+)?'", rf"\1?v={V}'", s)
    s = re.sub(r'(src="assets/js/(?:store|admin|boot-guard)\.js)(?:\?v=[\w]+)?"', rf'\1?v={V}"', s)
    s = re.sub(r'(href="assets/css/(?:theme|store|admin)\.css)(?:\?v=[\w]+)?"', rf'\1?v={V}"', s)
    open(f, 'w').write(s)
print('version', V)
