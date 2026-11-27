"""Restore the exact retained source responses; no network request."""
import hashlib,json,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/research/personal-edge-20261127'

def main():
    archive=OUT/'crypto-source-data.tar.gz'
    expected=json.loads((OUT/'crypto-source-data.json').read_text())['sha256']
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise ValueError('SOURCE_ARCHIVE_CHANGED')
    target=OUT/'data';target.mkdir(exist_ok=True)
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            if not member.isfile() or Path(member.name).name!=member.name:raise ValueError('UNSAFE_SOURCE_MEMBER')
            data=tar.extractfile(member).read()
            (target/member.name).write_bytes(data)
    print('Restored verified source archive without downloading data')

if __name__=='__main__':main()
