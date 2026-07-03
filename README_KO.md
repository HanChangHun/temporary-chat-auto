# ChatGPT Temporary Chat Auto

ChatGPT 새 대화는 자동으로 Temporary Chat 모드로, Claude 새 대화는 시크릿 채팅 모드로 열어 주는 Chrome Manifest V3 확장입니다.

이 확장은 비공식 확장이며 OpenAI와 관련이 없습니다.

[English README](README.md)

## 기능

- 새 ChatGPT 대화를 `temporary-chat=true` URL로 엽니다.
- 새 Claude 대화(`claude.ai`)를 `incognito` 파라미터가 붙은 URL로 엽니다.
- `chatgpt.com`, `chat.openai.com`, `claude.ai`의 New chat 링크를 보정합니다.
- 각 사이트의 Temporary Chat/시크릿 채팅 표시 근처에 작은 인페이지 토글을 추가합니다.
- 팝업은 자동 적용을 켜고 끄는 체크박스 하나만 제공합니다.
- Chrome sync storage에는 사용자의 켜기/끄기 설정만 저장합니다.

## 설치

### Chrome Web Store

현재 Chrome Web Store에 제출되어 심사를 기다리는 중입니다.

### 수동 설치

1. [Releases](https://github.com/HanChangHun/chatgpt-temporary-chat-auto/releases)에서 최신 store package를 내려받습니다.
2. zip 파일의 압축을 풉니다.
3. Chrome에서 `chrome://extensions`를 엽니다.
4. 오른쪽 위 `Developer mode`를 켭니다.
5. `Load unpacked`를 누르고 압축을 푼 폴더를 선택합니다.

## 동작 방식

- 확장은 `https://chatgpt.com/*`, `https://chat.openai.com/*`, `https://claude.ai/*`에서만 동작합니다.
- 새 채팅 URL과 New chat 링크에 사이트별 비공개 채팅 파라미터(ChatGPT는 `temporary-chat=true`, Claude는 `incognito`)를 붙입니다.
- ChatGPT 화면에 Temporary Chat 토글이 보이고 꺼진 상태가 명확할 때만 켭니다.
- 팝업과 ChatGPT 화면 안의 작은 토글은 같은 켜기/끄기 설정을 제어합니다.

## 개인정보

확장은 사용자 데이터를 수집, 전송, 판매, 공유하지 않습니다. ChatGPT·Claude 대화 내용, 계정 정보, 프롬프트, 응답을 외부 서버로 보내지 않습니다.

자세한 내용은 [PRIVACY.md](PRIVACY.md)를 확인하세요.

## 후원

이 확장이 도움이 되었다면 [Ko-fi에서 개발을 후원](https://ko-fi.com/edgetpu)할 수 있습니다. 후원은 선택 사항이며, 후원 여부와 관계없이 확장의 핵심 기능은 계속 사용할 수 있습니다.

## 라이선스와 브랜딩

소스 코드와 문서는 MIT License로 제공됩니다. 프로젝트 이름, 아이콘, 스토어 스크린샷, 프로모션 이미지, 기타 브랜딩 자산은 이 라이선스에 포함되지 않습니다. 자세한 내용은 [TRADEMARKS.md](TRADEMARKS.md)를 확인하세요.

## 배포 메모

Chrome Web Store 등록 문구, 개인정보 답변, 권한 설명, 한국어 제출 체크리스트는 [store/](store/) 폴더에 남겨 두었습니다. 다음 업데이트 때 다시 쓰기 좋아서 삭제하지 않고 보관합니다.
