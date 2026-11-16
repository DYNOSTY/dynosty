# 브라우저 재생 검사 파일

실제 게임 자료를 사용하지 않고 FFmpeg의 테스트 화면·정현파로 직접 만든 파일입니다. 개인 정보나 외부 음원·영상은 포함하지 않습니다. CI에서는 이 파일을 그대로 사용하며 FFmpeg 설치가 필요하지 않습니다.

- `test-video.webm`: 64×36, 초당 10프레임, 6초. VP8 영상과 Opus 확인음.
- `test-audio.wav`: 0.2초, 8kHz 모노 PCM 16비트 확인음. BGM 독립 재생 확인용.

생성 명령은 비어 있는 작업 폴더에서 실행합니다. `-n`은 기존 파일을 덮어쓰지 않습니다.

```sh
ffmpeg -nostdin -hide_banner -loglevel error -n -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 6 -c:v libvpx -b:v 40k -c:a libopus -b:a 16k -shortest test-video.webm
ffmpeg -nostdin -hide_banner -loglevel error -n -f lavfi -i sine=frequency=220:sample_rate=8000 -t 0.2 -c:a pcm_s16le test-audio.wav
```
