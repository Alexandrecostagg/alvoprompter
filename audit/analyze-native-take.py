"""Local capture QA: decode all timestamps and compare sampled decoded pixels.

Motion hashes are diagnostics for a deliberately moving test scene, not a
reason to reject a naturally still recording. No file leaves this computer.
"""
import argparse
import hashlib
import json
import math
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('source', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
source = str(args.source.resolve())

def run(*arguments):
    return subprocess.check_output(list(arguments), stderr=subprocess.PIPE, timeout=30)

probe = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', source))
video = next((s for s in probe['streams'] if s['codec_type'] == 'video'), None)
audio = next((s for s in probe['streams'] if s['codec_type'] == 'audio'), None)
if not video or not audio:
    raise SystemExit('Missing video or audio track')
frames = json.loads(run('ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time,pkt_duration_time', '-of', 'json', source))['frames']
times = [float(frame['best_effort_timestamp_time']) for frame in frames if 'best_effort_timestamp_time' in frame]
if len(times) < 2:
    raise SystemExit('Missing decoded video frames')
rate_parts = video.get('avg_frame_rate', '0/1').split('/')
rate = float(rate_parts[0]) / max(1, float(rate_parts[1]))
span = float(frames[-1].get('pkt_duration_time', 0)) or 1 / max(1, rate)
video_end = max(times) + span
audio_end = float(audio.get('duration', probe['format']['duration']))
duration = float(probe['format']['duration'])
max_gap = max([times[0], span] + [max(0, b-a) for a, b in zip(times, times[1:])])
sample_times = sorted(set([min(1, max(0, video_end - .2))] + [t for t in [16, 30, 60, 90, 120] if t < video_end-1] + [max(0, video_end-.5)]))
samples = []
previous = None
for time in sample_times:
    pixels = run('ffmpeg', '-v', 'error', '-ss', str(time), '-i', source, '-frames:v', '1', '-vf', 'scale=96:-2', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1')
    difference = sum(abs(a-b) for a, b in zip(previous, pixels)) / len(pixels) if previous and len(previous) == len(pixels) and pixels else None
    samples.append({'time': time, 'bytes': len(pixels), 'sha256': hashlib.sha256(pixels).hexdigest(), 'meanPixelChange': difference})
    previous = pixels
volume = subprocess.run(['ffmpeg', '-hide_banner', '-i', source, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True, check=True, timeout=30).stderr
peak_match = re.search(r'max_volume:\s*(-?[\d.]+|inf|-inf) dB', volume)
peak = float(peak_match.group(1)) if peak_match else None
result = {
    'source': str(args.source), 'duration': duration,
    'video': {'codec': video['codec_name'], 'width': video.get('width'), 'height': video.get('height'), 'frames': len(times), 'end': video_end, 'largestGap': max_gap, 'averageFrameRate': rate},
    'audio': {'codec': audio['codec_name'], 'end': audio_end, 'peakDb': peak if peak is not None and math.isfinite(peak) else None},
    'samples': samples, 'distinctSamples': len(set(s['sha256'] for s in samples)),
    'technicallyComplete': abs(video_end-audio_end) <= 1 and abs(duration-video_end) <= 1 and max_gap <= 1 and all(s['bytes'] for s in samples),
    'note': 'Decoded timestamps, signal and pixel differences require visual review against the moving test scene.'
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2))
print(json.dumps({k: v for k, v in result.items() if k != 'samples'}, indent=2))
