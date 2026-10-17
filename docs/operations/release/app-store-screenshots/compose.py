import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S, F = sys.argv[1], 'C:/Users/user/vsproject/mfz_ui2nd/assets/fonts/'
W, H, BG = 1320, 2868, (37, 99, 235)
items = [
  ('r1/a_home.png',  '현장을 지도에서 한눈에',      '부산 곳곳의 현장 상태를 핀으로 확인'),
  ('r2/s_prep.png',  '갈 곳만 담으면 순서 정리 끝', '가까운 순으로 정렬하고 바로 출발'),
  ('r1/e_trip.png', '방문 순서와 조치 결과를 기록', '현장마다 체크인하면 외근이 정리돼요'),
  ('r1/g_report.png','사진만 찍으면 보고서 완성',   '현장별 전·중·후 사진을 한 문서로'),
  ('r2/s_choro.png', '구역별 현장 분포를 한눈에',   '시·군·구별 현장 수를 지도로 비교'),
]
h1 = ImageFont.truetype(F + 'Pretendard-ExtraBold.otf', 92)
h2 = ImageFont.truetype(F + 'Pretendard-SemiBold.otf', 50)
SW = 1000; SH = round(2868 * SW / 1320); TOP = 600; R = 64
for n, (src, t1, t2) in enumerate(items, 1):
    c = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(c)
    d.text((W / 2, 250), t1, font=h1, fill='white', anchor='mm')
    d.text((W / 2, 380), t2, font=h2, fill=(219, 234, 254), anchor='mm')
    shot = Image.open(f'{S}/{src}').convert('RGB').resize((SW, SH), Image.LANCZOS)
    x = (W - SW) // 2
    m = Image.new('L', (SW, SH), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, SW, SH), R, fill=255)
    sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).rounded_rectangle((x, TOP + 24, x + SW, TOP + SH + 24), R, fill=90)
    sh = sh.filter(ImageFilter.GaussianBlur(36))
    c = Image.composite(Image.new('RGB', (W, H), (15, 40, 120)), c, sh)
    c.paste(shot, (x, TOP), m)
    out = f'{S}/final/{n:02d}.png'; c.save(out); print(out, c.size, c.mode)
