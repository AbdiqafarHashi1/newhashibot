"""Restore an exact archived fake-terminal source version without a download."""
import argparse,hashlib,json,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'docs/research/strategy-recovery-20261127'
def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',choices=['paired','orb']);args=parser.parse_args()
    spec=json.loads((OUT/'source-archives.json').read_text())[args.source]
    archive=OUT/f'{args.source}-source.tar.gz'
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=spec['sha256']:raise ValueError('SOURCE_ARCHIVE_CHANGED')
    target=ROOT/'.tmp'/f'restored-{args.source}-agent';target.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive) as tar:
        members=tar.getmembers()
        if len({m.name for m in members})!=len(members):raise ValueError('DUPLICATE_ARCHIVE_MEMBER')
        for m in members:
            p=Path(m.name)
            if not m.isfile() or p.is_absolute() or '..' in p.parts:raise ValueError('UNSAFE_ARCHIVE_MEMBER')
        for m in members:
            data=tar.extractfile(m).read()
            if m.name in spec['module_sha256'] and hashlib.sha256(data).hexdigest()!=spec['module_sha256'][m.name]:raise ValueError('SOURCE_MODULE_CHANGED')
            p=target/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    print('Restored exact source:',target)
if __name__=='__main__':main()
