"""홈 화면 아이콘 생성: 종이색 배경 위에 pencil_1h 캐릭터.
192/512(일반), 512(maskable 안전영역), 180(apple-touch) 생성."""
import os
from PIL import Image

PAPER = (250, 247, 239, 255)
SRC = "web/assets/pencil_1h.png"
OUT = "web/assets"


def make(size, pad_ratio, name):
    canvas = Image.new("RGBA", (size, size), PAPER)
    ch = Image.open(SRC).convert("RGBA")
    inner = int(size * (1 - pad_ratio))
    ratio = min(inner / ch.width, inner / ch.height)
    nw, nh = int(ch.width * ratio), int(ch.height * ratio)
    ch = ch.resize((nw, nh), Image.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(ch, (x, y), ch)
    path = os.path.join(OUT, name)
    canvas.save(path)
    print("saved", path)


make(192, 0.16, "icon-192.png")
make(512, 0.16, "icon-512.png")
make(512, 0.28, "icon-maskable-512.png")  # 마스커블: 안전영역 넉넉히
make(180, 0.16, "apple-touch-icon.png")
