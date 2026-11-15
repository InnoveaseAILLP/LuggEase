#!/usr/bin/env python3
"""Export generated master artwork to platform sizes using macOS sips; no recoloring."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'assets/branding/luggease-icon-master.png'

def export(destination: Path, size: int):
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['sips', '-z', str(size), str(size), str(MASTER), '--out', str(destination)], check=True, stdout=subprocess.DEVNULL)


def main():
    if not MASTER.is_file():
        raise SystemExit('Save the approved icon master in assets/branding/luggease-icon-master.png first.')
    export(ROOT / 'assets/branding/luggease-icon.png', 256)
    export(ROOT / 'assets/images/icon.png', 1024)
    export(ROOT / 'assets/images/adaptive-icon.png', 432)
    export(ROOT / 'assets/images/favicon.png', 48)
    for name, size in [('favicon-16.png',16), ('favicon-32.png',32), ('apple-touch-icon.png',180), ('icons/luggease-192.png',192), ('icons/luggease-512.png',512)]:
        export(ROOT / 'public' / name, size)

    ios = ROOT / 'ios/LuggEase/Images.xcassets/AppIcon.appiconset'
    contents = json.loads((ios / 'Contents.json').read_text())
    existing = {(entry['idiom'], entry['size'], entry['scale']) for entry in contents['images']}
    for size, scales in [('20', ['1x','2x']),('29',['1x','2x']),('40',['1x','2x']),('76',['1x','2x']),('83.5',['2x'])]:
        for scale in scales:
            key = ('ipad', size+'x'+size, scale)
            if key not in existing:
                contents['images'].append(dict(zip(['idiom','size','scale'], key)))
    for entry in contents['images']:
        size = round(float(entry['size'].split('x')[0]) * float(entry['scale'][:-1]))
        entry['filename'] = f"{entry['idiom']}-{entry['size']}-{entry['scale']}.png"
        export(ios / entry['filename'], size)
    (ios / 'Contents.json').write_text(json.dumps(contents, indent=2)+'\n')

    res = ROOT / 'android/app/src/main/res'
    for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
        for name in ['ic_launcher.png','ic_launcher_round.png']:
            export(res / ('mipmap-'+density) / name, size)
    export(res / 'drawable-nodpi/luggease_icon_foreground.png', 432)
    adaptive = res / 'mipmap-anydpi-v26'
    adaptive.mkdir(parents=True, exist_ok=True)
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/luggease_icon_background" />
    <foreground>
        <inset android:drawable="@drawable/luggease_icon_foreground" android:inset="20%" />
    </foreground>
</adaptive-icon>
'''
    for name in ['ic_launcher.xml','ic_launcher_round.xml']:
        (adaptive / name).write_text(xml)
    (res / 'values/branding.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="luggease_icon_background">#FFF8F2</color></resources>\n')
    print('Exported in-app, web, iPhone/iPad and Android launcher icons.')

if __name__ == '__main__':
    main()
