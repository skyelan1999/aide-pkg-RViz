"""Build a deterministic, allowlisted Aide plugin ZIP; no private/test/runtime data."""
from pathlib import Path
import hashlib
import json
import zipfile
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
files = ['manifest.json', 'index.js', 'runtime.cjs', 'viewer.html', 'LICENSE', 'README.md', 'docs/ACCEPTANCE-0.1.1.zh-CN.md', 'docs/RELEASE-NOTES-0.1.1.md', 'THIRD_PARTY_NOTICES.md', 'assets/THREE-LICENSE.txt', 'assets/WS-LICENSE.txt', 'examples/docker/README.md', 'examples/docker/compose.yaml', 'examples/docker/Dockerfile.ros1', 'examples/docker/Dockerfile.ros2', 'examples/docker/start-demo.sh', 'examples/project/robot.urdf', 'scripts/ros-publisher.py']
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f"rviz-{manifest['version']}-preview.zip"
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in files:
        info = zipfile.ZipInfo(name, (2026, 10, 28, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, (root / name).read_bytes())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(out / 'SHA256SUMS').write_text(f'{digest}  {archive.name}\n')
print(json.dumps({'path': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest, 'entries': files}, ensure_ascii=False))
