import json, glob, sys
from PIL import Image
m=json.load(open('qa/traces/cast/meta.json')); f=m['face']
fs=sorted(glob.glob('qa/traces/cast/f*.png'))
W=int(sys.argv[1]); im0=Image.open(fs[-1]).convert('RGB'); sx=im0.width/W
pts=[(f['x']+f['width']*a, f['y']+f['height']*b) for a in (0.15,0.5,0.85) for b in (0.85,0.93)]
def col(im): return [im.getpixel((int(x*sx),int(y*sx))) for x,y in pts]
final=col(im0)
dark=[]
for i,p in enumerate(fs):
    c=col(Image.open(p).convert('RGB'))
    nd=sum(1 for x in c if sum(x)/3<100)
    if nd>=3: dark.append(round(m['ts'][i]-m['t0'],2))
print(sys.argv[1],'frames',len(fs),'final',final[0],'dark frames at',dark)
