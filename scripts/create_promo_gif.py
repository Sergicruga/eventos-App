from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import textwrap


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "promo"
OUT.mkdir(exist_ok=True)

W, H = 540, 960
FPS = 8
SCENE_SECONDS = 1.8
FRAMES_PER_SCENE = int(FPS * SCENE_SECONDS)

BLUE = (17, 86, 178)
BLUE_DARK = (14, 43, 89)
ACCENT = (255, 95, 95)
YELLOW = (255, 210, 80)
WHITE = (255, 255, 255)
MUTED = (218, 230, 255)


def font(size, bold=False):
    candidates = [
        Path(r"C:\Windows\Fonts\seguisb.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


F_TITLE = font(52, True)
F_BIG = font(46, True)
F_MED = font(30, True)
F_BODY = font(25, False)
F_SMALL = font(20, False)
F_BADGE = font(18, True)


def gradient_bg(t=0):
    sw, sh = 90, 160
    img = Image.new("RGB", (sw, sh), BLUE_DARK)
    pix = img.load()
    for y in range(sh):
        for x in range(sw):
            nx = x / sw
            ny = y / sh
            pulse = 0.15 * math.sin(t * math.pi * 2 + nx * 5 + ny * 3)
            r = int(12 + 32 * nx + 12 * ny + 15 * pulse)
            g = int(37 + 62 * ny + 10 * pulse)
            b = int(92 + 120 * (1 - ny) + 28 * nx)
            pix[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
    return img.resize((W, H), Image.Resampling.BICUBIC)


def load_logo(size=150):
    for name in ["goplan-logo.png", "iconoApp.png", "icon.png"]:
        p = ROOT / "assets" / name
        if p.exists():
            im = Image.open(p).convert("RGBA")
            im.thumbnail((size, size), Image.LANCZOS)
            return im
    return None


LOGO = load_logo(170)


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_center(draw, xy, text, fnt, fill=WHITE, spacing=8):
    x, y = xy
    lines = text.split("\n")
    total = sum(draw.textbbox((0, 0), line, font=fnt)[3] for line in lines) + spacing * (len(lines) - 1)
    yy = y - total / 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=fnt)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text((x - tw / 2, yy), line, font=fnt, fill=fill)
        yy += th + spacing


def wrap_text(text, width=22):
    return "\n".join(textwrap.wrap(text, width=width))


def paste_shadow(base, layer, pos, blur=18, alpha=90):
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, alpha))
    mask = layer.split()[-1].filter(ImageFilter.GaussianBlur(blur))
    shadow.putalpha(mask)
    base.alpha_composite(shadow, (pos[0], pos[1] + 10))
    base.alpha_composite(layer, pos)


def phone_mock(events=None):
    layer = Image.new("RGBA", (360, 610), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rounded_rect(d, (8, 8, 352, 602), 38, (245, 248, 255, 255))
    rounded_rect(d, (26, 28, 334, 580), 28, (238, 244, 255, 255))
    d.text((48, 56), "GoPlan", font=F_MED, fill=BLUE_DARK)
    rounded_rect(d, (48, 100, 312, 150), 22, (226, 234, 252, 255))
    d.text((70, 112), "Buscar eventos...", font=F_SMALL, fill=BLUE)
    labels = events or [("Música", "42 eventos", ACCENT), ("Arte", "18 eventos", YELLOW), ("Deportes", "9 eventos", (72, 205, 196))]
    y = 190
    for title, sub, color in labels:
        rounded_rect(d, (48, y, 312, y + 92), 20, color + (255,))
        d.text((72, y + 18), title, font=F_MED, fill=WHITE)
        d.text((72, y + 55), sub, font=F_SMALL, fill=WHITE)
        y += 110
    return layer


def draw_event_cards(img, t):
    d = ImageDraw.Draw(img)
    cards = [
        ("Conciertos", "cerca de ti", ACCENT),
        ("Planes", "con amigos", (94, 204, 170)),
        ("Entradas", "en un toque", YELLOW),
    ]
    for i, (a, b, color) in enumerate(cards):
        x = 48 + i * 156
        y = int(570 + 18 * math.sin(t * math.pi * 2 + i))
        rounded_rect(d, (x, y, x + 130, y + 150), 22, (255, 255, 255, 235))
        rounded_rect(d, (x + 12, y + 12, x + 118, y + 76), 18, color)
        d.text((x + 14, y + 90), a, font=F_SMALL, fill=BLUE_DARK)
        d.text((x + 14, y + 118), b, font=font(16), fill=(80, 96, 125))


def scene(frame_no, scene_no, local_t):
    img = gradient_bg((scene_no + local_t) / 6).convert("RGBA")
    d = ImageDraw.Draw(img)
    fade = min(1, local_t * 4, (1 - local_t) * 4)
    y_bob = int(10 * math.sin(local_t * math.pi * 2))

    if scene_no == 0:
        if LOGO:
            logo_size = int(130 + 22 * math.sin(local_t * math.pi))
            logo = LOGO.copy()
            logo.thumbnail((logo_size, logo_size), Image.LANCZOS)
            paste_shadow(img, logo, ((W - logo.width) // 2, 130 + y_bob), blur=22, alpha=100)
        text_center(d, (W / 2, 380), "GoPlan", F_TITLE)
        text_center(d, (W / 2, 450), "Tu ciudad tiene planes.\nDescúbrelos.", F_BODY, MUTED)
        rounded_rect(d, (142, 770, 398, 824), 28, ACCENT)
        text_center(d, (W / 2, 792), "Disponible en Google Play", F_BADGE)

    elif scene_no == 1:
        text_center(d, (W / 2, 145), "¿No sabes qué hacer hoy?", F_BIG)
        text_center(d, (W / 2, 240), "Eventos cerca de ti\nsegún tu ubicación", F_BODY, MUTED)
        phone = phone_mock()
        paste_shadow(img, phone, (90, 310), blur=24, alpha=115)

    elif scene_no == 2:
        text_center(d, (W / 2, 150), "Música, arte,\ndeporte y más", F_BIG)
        text_center(d, (W / 2, 265), "Filtra por categorías\ny encuentra tu plan", F_BODY, MUTED)
        draw_event_cards(img, local_t)
        for i, txt in enumerate(["Música", "Arte", "Cine", "Gastro"]):
            x = 52 + i * 118
            rounded_rect(d, (x, 420, x + 96, 468), 24, (255, 255, 255, 235))
            text_center(d, (x + 48, 441), txt, F_BADGE, BLUE_DARK)

    elif scene_no == 3:
        text_center(d, (W / 2, 150), "Compra entradas\nsin complicarte", F_BIG)
        text_center(d, (W / 2, 265), "Accede al enlace del evento\ndirectamente desde GoPlan", F_BODY, MUTED)
        rounded_rect(d, (82, 400, 458, 650), 34, (255, 255, 255, 238))
        rounded_rect(d, (114, 438, 426, 510), 24, ACCENT)
        text_center(d, (W / 2, 470), "Comprar entradas", F_MED)
        d.text((126, 552), "Fat Freddy's Drop", font=F_MED, fill=BLUE_DARK)
        d.text((126, 594), "26 septiembre · Barcelona", font=F_SMALL, fill=(90, 110, 145))

    elif scene_no == 4:
        text_center(d, (W / 2, 150), "Haz planes\ncon tus amigos", F_BIG)
        text_center(d, (W / 2, 265), "Mira quién va\ny apúntate al evento", F_BODY, MUTED)
        for i, name in enumerate(["Sergio", "Marco", "Oso"]):
            x = 92 + i * 118
            y = 438 + int(10 * math.sin(local_t * math.pi * 2 + i))
            d.ellipse((x, y, x + 78, y + 78), fill=(255, 255, 255, 240))
            text_center(d, (x + 39, y + 33), name[0], F_MED, BLUE)
            text_center(d, (x + 39, y + 112), name, F_SMALL)
        rounded_rect(d, (156, 690, 384, 746), 28, (255, 255, 255, 235))
        text_center(d, (W / 2, 712), "2 amigos van", F_BADGE, BLUE_DARK)

    else:
        if LOGO:
            logo = LOGO.copy()
            logo.thumbnail((150, 150), Image.LANCZOS)
            paste_shadow(img, logo, ((W - logo.width) // 2, 120), blur=22, alpha=100)
        text_center(d, (W / 2, 350), "Descubre planes\ncerca de ti", F_BIG)
        text_center(d, (W / 2, 470), "GoPlan", F_TITLE)
        rounded_rect(d, (100, 640, 440, 700), 30, ACCENT)
        text_center(d, (W / 2, 664), "Descárgala en Google Play", F_BADGE)
        text_center(d, (W / 2, 780), "@GoPlan", F_BODY, MUTED)

    if fade < 1:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, int((1 - fade) * 255)))
        img.alpha_composite(overlay)
    return img.convert("P", palette=Image.Palette.ADAPTIVE, colors=128)


frames = []
for s in range(6):
    for i in range(FRAMES_PER_SCENE):
        frames.append(scene(len(frames), s, i / max(1, FRAMES_PER_SCENE - 1)))

gif_path = OUT / "goplan_promo_instagram_x.gif"
frames[0].save(
    gif_path,
    save_all=True,
    append_images=frames[1:],
    duration=int(1000 / FPS),
    loop=0,
    optimize=True,
)

cover = scene(0, 5, 0.45).convert("RGB")
cover_path = OUT / "goplan_promo_cover.png"
cover.save(cover_path, quality=95)

caption = OUT / "goplan_promo_caption.txt"
caption.write_text(
    """Texto sugerido para Instagram/X:

Tu ciudad está llena de planes. 🎶🎭🏃
Con GoPlan descubre eventos cerca de ti, mira quién va y compra entradas en un toque.

Descárgala en Google Play.

#GoPlan #Planes #Eventos #Barcelona #Ocio #Conciertos #Arte #Deporte
""",
    encoding="utf-8",
)

print(gif_path)
print(cover_path)
print(caption)
