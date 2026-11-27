"""
Fabrique les icônes et l'écran de démarrage des applis App Store / Google Play
à partir des images de assets/ (icon.png, android-icon-*.png, splash-icon.png).
  python3 scripts/store-icons.py      (demande Pillow : pip install pillow)
À relancer seulement si le logo change ; les images produites sont gardées dans Git.
"""
from pathlib import Path
from PIL import Image

GREEN = (0x2F, 0x76, 0x58)
A = Path('assets')
RES = Path('android/app/src/main/res')
IOS = Path('ios/App/App/Assets.xcassets')

icon = Image.open(A / 'icon.png').convert('RGB')
fg = Image.open(A / 'android-icon-foreground.png').convert('RGBA')
bg = Image.open(A / 'android-icon-background.png').convert('RGB')
mono = Image.open(A / 'android-icon-monochrome.png').convert('RGBA')
logo = Image.open(A / 'splash-icon.png').convert('RGBA')

# iPhone : une seule icône 1024 x 1024, sans transparence.
icon.resize((1024, 1024), Image.LANCZOS).save(IOS / 'AppIcon.appiconset/AppIcon-512@2x.png')

def splash(w, h, logo_ratio=0.28):
    im = Image.new('RGB', (w, h), GREEN)
    s = int(min(w, h) * logo_ratio)
    l = logo.resize((s, s), Image.LANCZOS)
    im.paste(l, ((w - s) // 2, (h - s) // 2), l)
    return im

# iPhone : écran de démarrage (carré, centré sur l'écran).
for name in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    splash(2732, 2732, 0.18).save(IOS / 'Splash.imageset' / name)

# Android : icônes classiques, rondes et adaptatives (avant-plan 108 dp).
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in DENS.items():
    n = int(48 * k)
    ic = icon.resize((n, n), Image.LANCZOS)
    ic.save(RES / f'mipmap-{d}/ic_launcher.png')
    mask = Image.new('L', (n, n), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, n - 1, n - 1), fill=255)
    rnd = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    rnd.paste(ic, (0, 0), mask)
    rnd.save(RES / f'mipmap-{d}/ic_launcher_round.png')
    f = int(108 * k)
    fg.resize((f, f), Image.LANCZOS).save(RES / f'mipmap-{d}/ic_launcher_foreground.png')
    bg.resize((f, f), Image.LANCZOS).save(RES / f'mipmap-{d}/ic_launcher_background.png')
    # Petite icône des notifications : blanche sur transparent (24 dp).
    out = RES / f'drawable-{d}'
    out.mkdir(exist_ok=True)
    m = mono.resize((int(24 * k), int(24 * k)), Image.LANCZOS)
    white = Image.new('RGBA', m.size, (255, 255, 255, 0))
    white.putalpha(m.getchannel('A'))
    white.save(out / 'ic_stat_vitrine.png')
    # Écrans de démarrage (anciens Android) portrait et paysage.
    for orient in ['port', 'land']:
        p = RES / f'drawable-{orient}-{d}/splash.png'
        w, h = Image.open(p).size
        splash(w, h).save(p)

w, h = Image.open(RES / 'drawable/splash.png').size
splash(w, h).save(RES / 'drawable/splash.png')
print('icônes et écrans de démarrage prêts')
