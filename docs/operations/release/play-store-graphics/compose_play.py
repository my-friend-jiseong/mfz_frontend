# Play 스토어 그래픽 — App Store 6.9" 합성본(1320x2868)을 Play 휴대전화 스크린샷(9:16, 1440x2560)으로
# 옮기고, 피처 그래픽(1024x500)을 만든다. Play 스크린샷은 긴 변이 짧은 변의 2배를 넘으면 안 된다(2868/1320=2.17).
import os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
SRC = os.path.join(HERE, '..', 'app-store-screenshots')
F = os.path.join(ROOT, 'assets', 'fonts')
BG = (37, 99, 235)

W, H = 1440, 2560
for n in range(1, 6):
    src = Image.open(os.path.join(SRC, f'{n:02d}.png')).convert('RGB')
    h = H; w = round(src.width * H / src.height)
    shot = src.resize((w, h), Image.LANCZOS)
    c = Image.new('RGB', (W, H), BG)
    c.paste(shot, ((W - w) // 2, 0))
    out = os.path.join(HERE, f'phone-{n:02d}.png'); c.save(out); print(out, c.size)

FW, FH = 1024, 500
c = Image.new('RGB', (FW, FH), BG); d = ImageDraw.Draw(c)
icon = Image.open(os.path.join(ROOT, 'assets', 'icon.png')).convert('RGB').resize((220, 220), Image.LANCZOS)
m = Image.new('L', icon.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, 220, 220), 48, fill=255)
c.paste(icon, (110, 140), m)
d.text((380, 200), '일가요', font=ImageFont.truetype(os.path.join(F, 'Pretendard-ExtraBold.otf'), 96), fill='white', anchor='ls')
d.text((382, 268), '지도 기반 외근 도우미', font=ImageFont.truetype(os.path.join(F, 'Pretendard-SemiBold.otf'), 44), fill=(219, 234, 254), anchor='ls')
d.text((382, 330), '현장 기록부터 보고서까지 한 번에', font=ImageFont.truetype(os.path.join(F, 'Pretendard-Regular.otf'), 32), fill=(191, 219, 254), anchor='ls')
out = os.path.join(HERE, 'feature-graphic.png'); c.save(out); print(out, c.size)
