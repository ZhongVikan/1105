"""Build short Chinese voice assets. Requires: pip install edge-tts.
Run in a network-enabled development environment; all output ships offline.
Use system-approved local CA certificates where a corporate proxy is present.
"""
import asyncio,json,ssl,os
from pathlib import Path
import edge_tts,edge_tts.communicate as ec
ROOT=Path(__file__).resolve().parents[1]
for cert in Path('/usr/local/share/ca-certificates').glob('*.crt'):
    ec._SSL_CTX.load_verify_locations(cafile=str(cert))
async def main():
    gate=asyncio.Semaphore(3)
    async def one(item):
        out=ROOT/'assets/voices'/(item['id']+'.mp3')
        if out.exists() and out.stat().st_size>1000:return
        async with gate:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(item['text'],voice='zh-CN-YunxiNeural',rate='+8%',connect_timeout=10,receive_timeout=20).save(str(out))
                    print(item['id'],item['text'],flush=True);return
                except Exception:
                    if attempt==2:raise
    await asyncio.gather(*(one(v) for v in json.loads((ROOT/'assets/voices/manifest.json').read_text())))
asyncio.run(main())
