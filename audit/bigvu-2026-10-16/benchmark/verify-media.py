import array,json,math,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parent
results={}
for name in ['source','baseline','cut']:
    path=root/(name+'.mp4')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,codec_type,duration,width,height,sample_rate','-of','json',str(path)]))
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-vn','-ac','1','-ar','48000','-f','f32le','-'])
    samples=array.array('f',raw)
    observations=[]
    for t in ([.5,1.5,2.5,3.5] if name=='cut' else [.5,2.5,4.5,6.5]):
        seg=samples[int(t*48000):int((t+.1)*48000)]
        rms=math.sqrt(sum(x*x for x in seg)/len(seg))
        energies={f:abs(sum(x*complex(math.cos(2*math.pi*f*i/48000),-math.sin(2*math.pi*f*i/48000)) for i,x in enumerate(seg))) for f in [440,880,1320]}
        tone=max(energies,key=energies.get) if rms>.005 else 'silence'
        rgb=subprocess.check_output(['ffmpeg','-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-vf','crop=16:16:300:160,format=rgb24','-f','rawvideo','-'])
        avg=[round(sum(rgb[c::3])/len(rgb[c::3]),1) for c in range(3)]
        observations.append({'time':t,'rms':round(rms,5),'dominant_reference_tone_hz':tone,'center_rgb':avg})
    results[name]={'probe':probe,'samples':observations}
cut=results['cut']; baseline=results['baseline']
results['checks']={
 'baseline_duration_within_150ms':abs(float(baseline['probe']['format']['duration'])-8)<.15,
 'cut_duration_within_150ms':abs(float(cut['probe']['format']['duration'])-4)<.15,
 'cut_reference_tones_correct':[x['dominant_reference_tone_hz'] for x in cut['samples']]==[440,440,880,880],
 'cut_reference_colors_correct':all(x['center_rgb'][0]>200 and x['center_rgb'][2]<50 for x in cut['samples'][:2]) and all(x['center_rgb'][2]>200 and x['center_rgb'][0]<50 for x in cut['samples'][2:]),
 'baseline_reference_tones_correct':[x['dominant_reference_tone_hz'] for x in baseline['samples']]==[440,'silence',880,1320]
}
results['limits']='Short synthetic desktop-browser fixture; coarse interior samples do not measure lip sync, splice transients, speech intelligibility, native audio routing or long-video reliability.'
(root/'media-results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
