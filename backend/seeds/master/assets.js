const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PDFDocument = require('pdfkit');
const { COURSES, lesson } = require('./content');
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function cover(spec) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#fbf3e4"/><path d="M720 0H1200V760H620C820 560 580 280 720 0" fill="${spec.color}"/><circle cx="960" cy="210" r="110" fill="#f8d685"/><path d="M710 620L845 410L960 530L1090 330L1200 550V760H710Z" fill="#3d1420" opacity=".7"/><rect x="72" y="80" width="160" height="44" rx="22" fill="${spec.color}"/><text x="152" y="110" fill="white" text-anchor="middle" font-family="Arial" font-size="24">${spec.level}</text><text x="72" y="210" fill="#3d1420" font-family="Georgia" font-size="48">${escape(spec.title.split(':')[0])}</text><text x="72" y="275" fill="#7a5a60" font-family="Arial" font-size="25">Historias para comprender y conversar</text><path d="M95 390Q235 330 375 390V585Q235 525 95 585ZM375 390Q515 330 655 390V585Q515 525 375 585Z" fill="white" stroke="${spec.color}" stroke-width="7"/><path d="M130 420H310M130 460H285M130 500H325M420 420H595M420 460H570M420 500H610" stroke="#d6c7b2" stroke-width="8"/><text x="72" y="687" fill="#3d1420" font-family="Arial" font-size="22" letter-spacing="5">SPANISHNOW · APRENDE CON HISTORIAS</text></svg>`;
}
async function pdf(spec, unitIndex) {
  return new Promise((resolve,reject)=>{
    const doc = new PDFDocument({ size:'A4', margin:50, info:{Title:`Cuaderno: ${spec.units[unitIndex]}`,Author:'SpanishNow · demostración local'} });
    const chunks=[]; doc.on('data',b=>chunks.push(b)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject);
    doc.fillColor(spec.color).fontSize(12).text('SPANISHNOW · CUADERNO DE PRÁCTICA');
    doc.moveDown().fillColor('#3d1420').fontSize(26).text(spec.units[unitIndex]);
    doc.fontSize(11).fillColor('#555555').text(`${spec.title} · ${spec.level}\nContenido ficticio para la demostración local.`);
    for(let i=0;i<3;i++) {
      const content=lesson(spec,unitIndex*3+i);
      doc.addPage().fillColor(spec.color).fontSize(20).text(content.title);
      doc.moveDown().fillColor('#222222').fontSize(11).text(content.frames.join('\n\n'),{lineGap:4});
      doc.moveDown().font('Helvetica-Bold').text('Comprende y cuenta'); doc.font('Helvetica');
      content.questions.forEach(q=>{doc.moveDown(.5).text(q.text).text('________________________________________________________________');});
      doc.moveDown().font('Helvetica-Bold').text('Expresiones para recordar'); doc.font('Helvetica');
      content.words.forEach(([w,t,e])=>doc.moveDown(.3).text(`${w} — ${t}. ${e}`));
    }
    doc.end();
  });
}
function validWav(filename) {
  if (!fs.existsSync(filename)) return false;
  const stat=fs.statSync(filename), header=Buffer.alloc(Math.min(stat.size,65536));
  const fd=fs.openSync(filename,'r');try{fs.readSync(fd,header,0,header.length,0);}finally{fs.closeSync(fd);}
  if(header.length<44||header.toString('ascii',0,4)!=='RIFF'||header.toString('ascii',8,12)!=='WAVE')return false;
  for(let offset=12;offset+8<=header.length;) {
    const size=header.readUInt32LE(offset+4), kind=header.toString('ascii',offset,offset+4);
    if(kind==='data')return size>=44100 && offset+8+size<=stat.size;
    offset+=8+size+(size%2);
  }
  return false;
}
async function prepare({ directory, baseUrl = '/seed-master', audio = false, voice = 'Paulina', log = ()=>{} }) {
  await fs.promises.mkdir(directory,{recursive:true});
  const files=[],sizes={};
  const write = async(name,buffer)=>{await fs.promises.writeFile(path.join(directory,name),buffer);files.push(name);sizes[name]=Buffer.byteLength(buffer);};
  for(const spec of COURSES) {
    await write(`${spec.key}.svg`,cover(spec));
    for(let ui=0;ui<3;ui++) await write(`${spec.key}-${ui}.pdf`,await pdf(spec,ui));
    if(audio) {
      log(`Sintetizando narraciones locales: ${spec.title}`);
      for(let i=0;i<9;i++) for(const [suffix,rate] of [['normal',155],['slow',110]]) {
        const filename=`${spec.key}-${i}-${suffix}.wav`; const output=path.join(directory,filename);
        if(!validWav(output)) {
          const pending=`${output}.pending.wav`;
          const result=spawnSync('say',['-v',voice,'-r',String(rate),'--file-format=WAVE','--data-format=LEI16@22050','-o',pending],{input:lesson(spec,i).frames.join('\n\n'),encoding:'utf8',timeout:120000});
          if(result.error||result.status!==0||!validWav(pending)) {
            await fs.promises.rm(pending,{force:true});
            throw new Error(`No se pudo generar audio local (${filename}): ${result.error?.message || result.stderr || 'WAV vacío/incompleto'}. Instalá la voz indicada o ejecutá sin --audio.`);
          }
          await fs.promises.rename(pending,output);
        }
        files.push(filename); sizes[filename]=(await fs.promises.stat(output)).size;
      }
    }
  }
  return {files,sizes,directory,url:name=>`${baseUrl.replace(/\/$/,'')}/${name}`};
}
module.exports={prepare,validWav};
