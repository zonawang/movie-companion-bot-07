"""Render the repository-native four-tile artwork (Pillow 13.0.0). No runtime bot dependency."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

parser=argparse.ArgumentParser();parser.add_argument('--font');args=parser.parse_args()
candidates=[args.font,'/System/Library/Fonts/STHeiti Medium.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
font_path=next((p for p in candidates if p and Path(p).is_file()),None)
if not font_path:raise SystemExit('Pass --font with a Traditional Chinese TTF/TTC font.')
scale=2
image=Image.new('RGB',(2500*scale,1686*scale),'#f6f4ed');draw=ImageDraw.Draw(image)
def box(xy,**kwargs):
 for key in ['width','radius']:
  if key in kwargs:kwargs[key]*=scale
 draw.rounded_rectangle(tuple(int(v*scale) for v in xy),**kwargs)
def line(points,fill,width=7):draw.line([(int(x*scale),int(y*scale)) for x,y in points],fill=fill,width=width*scale,joint='curve')
def ellipse(xy,fill=None,outline=None,width=7):draw.ellipse(tuple(int(v*scale) for v in xy),fill=fill,outline=outline,width=width*scale)
def text(x,y,value,size,color):
 font=ImageFont.truetype(font_path,size*scale)
 draw.text((x*scale,y*scale),value,font=font,fill=color,anchor='mm')
tiles=[(0,0,'#f6f4ed','#243d34','電影查詢','找簡介、影評與場次','EXPLORE FILMS'),(1250,0,'#243d34','#fffef5','我的票匣','翻閱你的電影回憶','YOUR COLLECTION'),(0,843,'#e6eadc','#243d34','附近影院','從你的位置開始找','FIND NEARBY'),(1250,843,'#b85e3f','#fffef5','幫我挑電影','依心情，找到想看的電影','PICK A FILM')]
for i,(x,y,bg,fg,title,subtitle,eyebrow) in enumerate(tiles):
 box((x,y,x+1250,y+843),fill=bg,radius=0)
 text(x+92,y+76,f'0{i+1}',35,fg)
 text(x+625,y+720,eyebrow,29,fg)
 cx=x+625;cy=y+270
 if i==0:
  box((cx-106,cy-76,cx+106,cy+76),outline=fg,width=8,radius=18)
  for dy in [-46,12]:
   for dx in [-82,62]:box((cx+dx,cy+dy,cx+dx+20,cy+dy+34),fill=fg,radius=3)
  line([(cx-44,cy-76),(cx-44,cy+76)],fg,5);line([(cx+44,cy-76),(cx+44,cy+76)],fg,5)
 elif i==1:
  box((cx-111,cy-70,cx+111,cy+70),outline=fg,width=8,radius=16)
  ellipse((cx-130,cy-17,cx-94,cy+17),fill=bg,outline=fg,width=6)
  ellipse((cx+94,cy-17,cx+130,cy+17),fill=bg,outline=fg,width=6)
  for dy in range(-48,60,24):line([(cx+42,cy+dy),(cx+42,cy+dy+10)],fg,5)
  line([(cx-58,cy-22),(cx+9,cy-22)],fg,7);line([(cx-58,cy+18),(cx-8,cy+18)],fg,7)
 elif i==2:
  ellipse((cx-79,cy-105,cx+79,cy+53),outline=fg,width=8)
  draw.polygon([(int((cx-64)*scale),int(cy*scale)),(int(cx*scale),int((cy+108)*scale)),(int((cx+64)*scale),int(cy*scale))],fill=bg)
  line([(cx-69,cy+10),(cx,cy+108),(cx+69,cy+10)],fg,8)
  ellipse((cx-26,cy-54,cx+26,cy-2),outline=fg,width=7)
 else:
  box((cx-100,cy-70,cx+100,cy+70),outline=fg,width=8,radius=18)
  for dx in [-76,58]:
   for dy in [-46,16]:box((cx+dx,cy+dy,cx+dx+18,cy+dy+29),fill=fg,radius=2)
  line([(cx,cy-45),(cx+14,cy-12),(cx+49,cy-9),(cx+23,cy+14),(cx+31,cy+47),(cx,cy+29),(cx-31,cy+47),(cx-23,cy+14),(cx-49,cy-9),(cx-14,cy-12),(cx,cy-45)],fg,6)
 text(cx,y+452,title,94,fg);text(cx,y+575,subtitle,41,fg)
line([(1250,0),(1250,1686)],'#d3d8cb',3);line([(0,843),(2500,843)],'#d3d8cb',3)
image=image.resize((2500,1686),Image.Resampling.LANCZOS)
path=Path(__file__).resolve().parents[1]/'assets/richmenu.png';image.save(path,optimize=True)
assert path.stat().st_size<1000000
print(f'{path.name}: 2500x1686, {path.stat().st_size} bytes')
