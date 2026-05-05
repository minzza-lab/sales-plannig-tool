// content.js
console.log("WelliHilli VOC AI Sync - Content Script Loaded (List Page Mode)");

function injectButtonsIntoList() {
  if (!window.location.href.includes('/customer/inquiry/list')) return;

  // Vuetify 테이블의 행(tr)들을 모두 찾습니다.
  const rows = document.querySelectorAll('.v-data-table__wrapper table tbody tr');
  
  rows.forEach(row => {
    // 이미 버튼이 달려있으면 패스
    if (row.querySelector('.ai-inline-btn')) return;

    // 답변여부 열(보통 6번째)과 제목 열(보통 5번째)
    const titleTd = row.querySelector('td:nth-child(5)');
    const statusTd = row.querySelector('td:nth-child(6)');

    if (!statusTd || !titleTd) return;

    // 'N'인 경우 미답변으로 간주
    const isUnanswered = statusTd.innerText.trim() === 'N';
    
    if (isUnanswered) {
      const link = titleTd.querySelector('a');
      if (!link) return;

      const seqUrl = link.href; // 상세 페이지 URL (예: ?seq=13746)
      
      const btn = document.createElement('button');
      btn.className = 'ai-inline-btn';
      btn.innerText = '🤖 AI 답변';
      btn.style.cssText = `
        margin-left: 10px;
        padding: 4px 8px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        vertical-align: middle;
      `;

      btn.onclick = async (e) => {
        e.preventDefault(); // 원래 링크(상세페이지 이동) 방지
        e.stopPropagation();
        
        const originalText = btn.innerText;
        btn.innerText = '불러오는 중...';
        
        try {
          // 상세 페이지를 백그라운드에서 몰래 Fetch 해옵니다!
          const response = await fetch(seqUrl);
          const html = await response.text();
          
          // 가져온 HTML을 파싱합니다
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          let customerName = '';
          let vocContent = '';
          let category = '';
          let title = '';

          const ths = doc.querySelectorAll('th');
          ths.forEach(th => {
            const label = th.innerText.trim();
            const td = th.nextElementSibling;
            if (!td) return;

            if (label.includes('성명') || label.includes('이름') || label.includes('등록자')) {
              customerName = td.innerText.trim().split(/\s+/)[0];
            }
            if (label.includes('서비스') || label.includes('문의유형')) {
              category += '[' + td.innerText.trim() + '] ';
            }
            if (label.includes('내용')) {
              const textarea = td.querySelector('textarea');
              vocContent = textarea ? textarea.value : td.innerText.trim();
            }
            if (label.includes('제목')) {
              title = td.innerText.trim();
            }
          });

          const fullContent = `제목: ${title}\n카테고리: ${category}\n\n${vocContent}`;
          
          if (!vocContent) {
            alert('본문 내용을 추출하지 못했습니다.');
            btn.innerText = originalText;
            return;
          }

          // 대시보드로 데이터 쏴주기
          const dashboardUrl = 'https://sales-plannig-tool.pages.dev';
          const targetUrl = `${dashboardUrl}/tools/voc-assistant?name=${encodeURIComponent(customerName)}&content=${encodeURIComponent(fullContent)}`;
          
          window.open(targetUrl, '_blank');
          btn.innerText = originalText;
          
        } catch (err) {
          console.error(err);
          alert('상세 내용을 불러오는데 실패했습니다: ' + err.message);
          btn.innerText = originalText;
        }
      };

      // 제목 옆에 버튼을 달아줍니다.
      titleTd.appendChild(btn);
    }
  });
}

// 화면이 동적으로 바뀔 때마다 버튼을 주입하는 옵저버
const observer = new MutationObserver((mutations) => {
  if (window.location.href.includes('/customer/inquiry/list')) {
    injectButtonsIntoList();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectButtonsIntoList);
} else {
  injectButtonsIntoList();
}
