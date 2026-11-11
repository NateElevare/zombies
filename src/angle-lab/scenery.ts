import * as Phaser from 'phaser';
import { depth, project, wallOccludes, type LabCamera, type Obstacle, type Point } from './math';

export type V = [number, number, number];
type Face = { points: V[]; color: string; material?: string; crop?: [number, number, number, number]; shade?: number; normal?:V; detailLayer?:number; repeat?:[number,number] };
type Part = { faces: Face[]; at: Point; image: Phaser.GameObjects.Image; texture: Phaser.Textures.CanvasTexture; wall?: Obstacle; height: number; roof?: boolean };
const HOUSE = 'angle_house_materials', CAR = 'angle_sedan_materials';
const WINDOW: [number,number,number,number] = [2,2,252,252], SIDING: typeof WINDOW = [258,2,252,252], ROOF: typeof WINDOW = [2,258,252,252], FLOOR: typeof WINDOW = [258,258,252,252];

import { LAB_WALLS } from './layout';
export { LAB_OBSTACLES } from './layout';

/** Rasterized textured faces, split into independently sorted/fading wall sections. */
export class LabScenery {
  parts: Part[] = [];
  private static serial = 0;
  constructor(private scene: Phaser.Scene, build = true) { if(build)this.build(); }
  part(at: Point, wall?: Obstacle, roof = false) {
    const key = `angle_prop_${LabScenery.serial++}`;
    const texture = this.scene.textures.createCanvas(key, 1, 1)!;
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const part: Part = {at, faces:[], texture, image:this.scene.add.image(0,0,key).setOrigin(0),wall,height:94,roof};
    this.parts.push(part); return part;
  }
  face(p: Part, points: V[], color: string, material?: string, crop?: Face['crop'], shade = 0,normal?:V) { p.faces.push({points,color,material,crop,shade,normal}); }
  box(p: Part, x:number,y:number,w:number,d:number,h:number,color:string,z=0,material?:string,crop?:Face['crop']) {
    this.face(p,[[x,y,z+h],[x,y+d,z+h],[x,y+d,z],[x,y,z]],color,material,crop,.17,[-1,0,0]);
    this.face(p,[[x+w,y+d,z+h],[x+w,y,z+h],[x+w,y,z],[x+w,y+d,z]],color,material,crop,.23,[1,0,0]);
    this.face(p,[[x,y+d,z+h],[x+w,y+d,z+h],[x+w,y+d,z],[x,y+d,z]],color,material,crop,.06,[0,1,0]);
    this.face(p,[[x+w,y,z+h],[x,y,z+h],[x,y,z],[x+w,y,z]],color,material,crop,.15,[0,-1,0]);
    this.face(p,[[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],color);
  }
  private build() {
    // Interior floor and rug are under the actors, furniture and exterior walls.
    const floor=this.part({x:-205,y:-140}); floor.height=0;
    this.face(floor,[[-313,-218,1],[-97,-218,1],[-97,-50,1],[-313,-50,1]],'#735a3d',HOUSE,FLOOR);
    this.face(floor,[[-255,-170,2],[-175,-170,2],[-175,-95,2],[-255,-95,2]],'#654337');
    for(let i=0;i<5;i++)this.face(floor,[[-252+i*3,-167+i*3,2.1],[-178-i*3,-167+i*3,2.1],[-178-i*3,-98-i*3,2.1],[-252+i*3,-98-i*3,2.1]],i%2?'#66553b':'#73503d');
    for(const [i,o] of LAB_WALLS.entries()) {
      const p=this.part({x:o.x+o.w/2,y:o.y+o.h/2},o);
      this.box(p,o.x,o.y,o.w,o.h,94,'#b3aa8b',0,HOUSE,(i%2===0||i>=9)?WINDOW:SIDING);
      this.box(p,o.x-1,o.y-1,o.w+2,o.h+2,4,'#c1bba2',92);
      this.box(p,o.x,o.y+o.h,3,1,90,'#d5c8a4');
    }
    const lintel=this.part({x:-215,y:-50},{x:-245,y:-62,w:60,h:12});
    this.box(lintel,-245,-62,60,12,15,'#b8b092',79,HOUSE,SIDING);
    for(const x of [-245,-188])this.box(lintel,x,-63,3,14,79,'#b8b092');
    const step=this.part({x:-215,y:-30}); step.height=0;
    this.box(step,-250,-50,70,25,4,'#828477');
    // A gabled shingle roof, fascia and chimney are one removable cutaway layer.
    const roof=this.part({x:-205,y:-35},undefined,true);
    this.face(roof,[[-335,-240,96],[-335,-140,150],[-75,-140,150],[-75,-240,96]],'#343a38',HOUSE,ROOF,.12);
    this.face(roof,[[-335,-140,150],[-75,-140,150],[-75,-40,96],[-335,-40,96]],'#4a4c42',HOUSE,ROOF);
    this.face(roof,[[-75,-240,96],[-75,-140,150],[-75,-40,96]],'#aaa389');
    this.box(roof,-337,-43,264,5,6,'#b7b19b',91);
    this.box(roof,-337,-144,264,7,4,'#565c52',150);
    this.box(roof,-290,-190,25,22,65,'#856048',95);
    for(let z=102;z<160;z+=8)this.box(roof,-290,-168,25,1,1,'#453d32',z);
    this.box(roof,-293,-193,31,28,5,'#aaa696',160);
    this.face(roof,[[-287,-187,166],[-268,-187,166],[-268,-171,166],[-287,-171,166]],'#222720');
    // Furnished single-room house: sofa, bed, low table and scattered floor details.
    const sofa=this.part({x:-273,y:-180});
    this.box(sofa,-308,-212,70,32,22,'#575e45');this.box(sofa,-308,-212,70,8,35,'#657050');
    for(const x of [-306,-285,-264])this.box(sofa,x,-202,20,20,5,'#747b58',22);
    for(const x of [-309,-243])this.box(sofa,x,-209,6,30,31,'#4d563c');
    const bed=this.part({x:-125,y:-133});
    this.box(bed,-145,-208,40,75,15,'#4a3527');this.box(bed,-144,-206,38,71,7,'#aea68b',15);
    this.box(bed,-144,-184,38,49,3,'#5c6a73',22);this.box(bed,-140,-203,30,15,4,'#ccc4ad',22);
    for(let y=-180;y<-135;y+=8)this.box(bed,-143,y,36,1,1,'#7e9092',25);
    const table=this.part({x:-273,y:-100});
    this.box(table,-293,-130,40,30,24,'#665038',0,HOUSE,FLOOR);this.box(table,-296,-133,46,36,4,'#8e744b',24);
    this.box(table,-285,-125,12,9,2,'#bcaf86',28);this.box(table,-267,-116,4,4,6,'#b7b8a0',28);
    const crate=this.part({x:36,y:-150});this.box(crate,15,-190,42,40,38,'#8a754d',0,HOUSE,FLOOR);
    for(const x of [17,49])this.box(crate,x,-150,5,2,35,'#524733');
    this.car();
  }
  car() {
    const p=this.part({x:197,y:120});
    // Tires, full UV body panels, sloped windshield/rear glass, cabin, chrome and lamps.
    for(const x of [143,247])for(const y of [82,145]){
      const circle=(r:number,yy:number):V[]=>Array.from({length:12},(_,i)=>[x+Math.cos(i*Math.PI/6)*r,yy,13+Math.sin(i*Math.PI/6)*r]);
      const normal:V=[0,y===82?-1:1,0],outer=y===82?y:y+10;
      this.face(p,circle(12,outer),'#1b211e',undefined,undefined,0,normal);
      this.face(p,circle(8,outer+normal[1]*.2),'#909386',undefined,undefined,0,normal);
      this.face(p,circle(4,outer+normal[1]*.4),'#4f5750',undefined,undefined,0,normal);
    }
    // Visible outside tire faces sit in front of the side body panel at every axle.
    for(const f of p.faces)f.detailLayer=1;
    // Paint only metal on the body. The old side crop contained wheels, duplicating the tires.
    this.box(p,120,85,155,70,25,'#29444b',12,CAR,[258,2,252,252]);
    p.faces.pop(); // hood, trunk and cabin below supply the top; no overlapping full-body lid
    this.face(p,[[164,85,37],[228,85,37],[228,155,37],[164,155,37]],'#29444b');
    this.face(p,[[120,85,37],[164,85,37],[164,155,37],[120,155,37]],'#345460',CAR,[258,2,252,252]);
    this.face(p,[[228,85,37],[275,85,37],[275,155,37],[228,155,37]],'#345460',CAR,[258,258,252,252]);
    this.face(p,[[164,85,37],[228,85,37],[217,92,62],[179,92,62]],'#283b3e',CAR,[73,381,55,53],.18,[0,-1,0]);
    this.face(p,[[179,148,62],[217,148,62],[228,155,37],[164,155,37]],'#283b3e',CAR,[73,381,55,53],0,[0,1,0]);
    this.face(p,[[197,148,62],[200,148,62],[201,155,37],[198,155,37]],'#526263');
    this.face(p,[[164,85,37],[179,92,62],[179,148,62],[164,155,37]],'#1e353a');
    this.face(p,[[217,92,62],[228,85,37],[228,155,37],[217,148,62]],'#243c40');
    this.face(p,[[179,92,62],[217,92,62],[217,148,62],[179,148,62]],'#345460',CAR,[258,258,252,252]);
    // Reflections and windshield crack, mirror stalks and front grille.
    this.face(p,[[167,95,42],[176,98,57],[176,119,57],[167,117,42]],'#657d7c');
    for(const y of [81,151])this.box(p,171,y,8,8,4,'#82908a',37);
    for(const x of [118,274])this.box(p,x,88,4,64,6,'#8b948c',17);
    for(const y of [89,140])this.box(p,117,y,2,11,9,'#d4c9a1',27);
    for(const y of [89,142])this.box(p,276,y,2,9,7,'#962f20',28);
    for(let y=105;y<139;y+=4)this.box(p,117,y,2,2,9,'#252d2b',25);
  }
  layout(camera: LabCamera, cutaway: boolean) {
    for(const p of this.parts) {
      p.image.setVisible(!p.roof||!cutaway);
      const points=p.faces.flatMap(f=>f.points.map(([x,y,z])=>project({x,y},z,camera)));
      const x=Math.floor(Math.min(...points.map(p=>p.x)))-2,y=Math.floor(Math.min(...points.map(p=>p.y)))-2;
      const w=Math.ceil(Math.max(...points.map(p=>p.x)))-x+2,h=Math.ceil(Math.max(...points.map(p=>p.y)))-y+2;
      p.texture.setSize(Math.max(1,w),Math.max(1,h));const g=p.texture.getContext();g.clearRect(0,0,w,h);g.imageSmoothingEnabled=false;
      // Orthographic painter order includes height; drawing every box in construction order
      // put rear mirrors and hidden panels on top of the cabin.
      const order=(f:Face)=>(f.detailLayer||0)*100000+f.points.reduce((n,[x,y,z])=>n+depth({x,y},camera.yaw)+z*Math.tan(camera.tilt*Math.PI/180),0)/f.points.length;
      for(const f of [...p.faces].sort((a,b)=>order(a)-order(b))) {
        if(f.normal&&f.normal[0]*Math.sin(camera.yaw*Math.PI/180)+f.normal[1]*Math.cos(camera.yaw*Math.PI/180)+f.normal[2]*Math.tan(camera.tilt*Math.PI/180)<=0)continue;
        const v=f.points.map(([x,y,z])=>project({x,y},z,camera));
        g.save();g.translate(-x,-y);g.beginPath();v.forEach((pt,i)=>i?g.lineTo(pt.x,pt.y):g.moveTo(pt.x,pt.y));g.closePath();g.fillStyle=f.color;g.fill();
        if(f.material&&f.crop&&v.length===4){
          const [sx,sy,sw,sh]=f.crop,source=this.scene.textures.get(f.material).getSourceImage() as CanvasImageSource;
          // Two affine triangles cover a trapezoid exactly; one affine quad cannot.
          for(const second of [false,true]){
            const a=v[0],b=v[second?2:1],c=v[second?3:2];
            g.save();g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.lineTo(c.x,c.y);g.closePath();g.clip();
            const ux=second?(b.x-c.x):(b.x-a.x),uy=second?(b.y-c.y):(b.y-a.y);
            const vx=second?(c.x-a.x):(c.x-b.x),vy=second?(c.y-a.y):(c.y-b.y);
            const [rx,ry]=f.repeat||[1,1];
            g.transform(ux/(sw*rx),uy/(sw*rx),vx/(sh*ry),vy/(sh*ry),a.x,a.y);
            for(let j=0;j<Math.ceil(ry);j++)for(let i=0;i<Math.ceil(rx);i++)g.drawImage(source,sx,sy,sw,sh,i*sw,j*sh,sw,sh);g.restore();
          }
          g.beginPath();v.forEach((pt,i)=>i?g.lineTo(pt.x,pt.y):g.moveTo(pt.x,pt.y));g.closePath();
        }
        if(f.shade){g.fillStyle=`rgba(12,19,16,${f.shade})`;g.fill();}
        g.strokeStyle='#20282199';g.lineWidth=Math.max(.65,camera.zoom);g.stroke();g.restore();
      }
      const sortDepth=p.roof?Math.max(...p.faces.flatMap(f=>f.points.map(([x,y])=>depth({x,y},camera.yaw))))+1:depth(p.at,camera.yaw);
      p.texture.refresh();p.image.setPosition(x,y).setDepth(p.height===0?2:1000+sortDepth);
    }
  }
  update(player: Point,camera: LabCamera,dt:number) {
    for(const part of this.parts){
      const blocked=part.wall?wallOccludes(player,part.wall,part.height,camera):part.roof&&wallOccludes(player,{x:-335,y:-240,w:260,h:200},155,camera);
      const target=blocked?.2:1;
      part.image.setAlpha(Phaser.Math.Linear(part.image.alpha,target,1-Math.exp(-dt*12)));
    }
  }
  destroy(){const textures=new Set(this.parts.map(p=>p.texture.key));for(const p of this.parts)p.image.destroy();for(const key of textures)this.scene.textures.remove(key);this.parts=[];}
}
