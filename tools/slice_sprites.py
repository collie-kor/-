"""
pencil_sprites_preview.png (968x600, 4x2 grid) 에서 캐릭터 8장을 잘라
배경을 투명 처리하고 359x404 캔버스에 발(하단) 기준으로 정렬해 저장한다.
결과: assets/pencil_1h.png ~ pencil_8h.png
"""
import os
from collections import deque
from PIL import Image

SRC = "pencil_sprites_preview.png"
OUT_DIR = os.path.join("web", "assets")
CANVAS = (359, 404)

# 카드(셀) 대략 경계. 타이틀/라벨 텍스트는 안쪽 여백으로 잘라낸다.
cols_x = [(13, 239), (252, 478), (491, 717), (730, 956)]
rows_y = [(13, 265), (315, 565)]

# 안쪽 여백: 위(타이틀 "N시간째"), 아래("N hour" 라벨) 제거
PAD_TOP, PAD_BOTTOM, PAD_SIDE = 44, 34, 16

BG_TOL = 26  # 배경으로 간주할 밝은 색 허용 오차


def is_bgish(px):
    r, g, b = px[0], px[1], px[2]
    # 밝은 회색/종이색 배경 (대략 235~255)
    return r > 228 and g > 224 and b > 214 and max(r, g, b) - min(r, g, b) < 22


def flood_transparent(img):
    """네 모서리에서 배경색을 flood fill 해 투명 처리."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        p = px[x, y]
        if is_bgish(p):
            px[x, y] = (p[0], p[1], p[2], 0)
            q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def autocrop_alpha(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def place_foot_aligned(char):
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    cw, ch = char.size
    max_w, max_h = CANVAS[0] - 20, CANVAS[1] - 24
    scale = min(max_w / cw, max_h / ch, 1.0)
    nw, nh = int(cw * scale), int(ch * scale)
    char = char.resize((nw, nh), Image.LANCZOS)
    x = (CANVAS[0] - nw) // 2
    y = CANVAS[1] - nh - 12  # 하단(발) 기준 정렬
    canvas.paste(char, (x, y), char)
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    idx = 0
    for (ry0, ry1) in rows_y:
        for (rx0, rx1) in cols_x:
            idx += 1
            box = (rx0 + PAD_SIDE, ry0 + PAD_TOP, rx1 - PAD_SIDE, ry1 - PAD_BOTTOM)
            cell = src.crop(box)
            cell = flood_transparent(cell)
            cell = autocrop_alpha(cell)
            out = place_foot_aligned(cell)
            path = os.path.join(OUT_DIR, f"pencil_{idx}h.png")
            out.save(path)
            print(f"saved {path}  char_bbox={cell.size}")


if __name__ == "__main__":
    main()
