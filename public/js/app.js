// ============================================
// 事件考察局 - SPA (Cases-first layout)
// ============================================

const App = {
  state: {
    search: '',
    tag: '',
    year: '',
    sort: 'updated',
    page: 1,
  },

  async init() {
    this.bindEvents();
    this.loadStats();
    this.loadTags();
    this.loadYears();
    this.handleRoute();
    window.addEventListener('popstate', () => this.handleRoute());
  },

  bindEvents() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-link]');
      if (link) { e.preventDefault(); this.navigate(link.getAttribute('href')); }
    });

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.state.search = e.target.value.trim();
        this.state.page = 1;
        this.loadCases();
      }, 400);
    });
  },

  // --- Routing ---
  handleRoute() {
    const path = window.location.pathname;
    if (path.startsWith('/case/')) {
      const slug = path.split('/case/')[1];
      this.renderCasePage(slug);
      document.getElementById('sidebar').style.display = '';
    } else if (path === '/about' || path === '/privacy' || path === '/rules' || path === '/contact') {
      this.renderStaticPage(path.substring(1));
      document.getElementById('sidebar').style.display = 'none';
    } else {
      this.state = { search: '', tag: '', year: '', sort: 'updated', page: 1 };
      document.getElementById('searchInput').value = '';
      document.getElementById('sidebar').style.display = '';
      document.title = '日本犯罪データベース - 事件考察＆掲示板';
      this.renderTopPage();
    }
  },

  navigate(url) {
    window.history.pushState({}, '', url);
    this.handleRoute();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async api(url) {
    const r = await fetch(url);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error'); }
    return r.json();
  },

  async apiPost(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  },

  // --- Top Page ---
  async renderTopPage() {
    document.getElementById('app').innerHTML = '<div class="loading">読み込み中</div>';
    await this.loadCases();
  },

  async loadCases() {
    const { search, tag, year, sort, page } = this.state;
    const params = new URLSearchParams({ page, limit: 30, sort });
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    if (year) params.set('year', year);

    try {
      const data = await this.api(`/api/cases?${params}`);
      this.renderCaseList(data);
    } catch (e) {
      document.getElementById('app').innerHTML = '<div class="empty-state"><p>読み込みに失敗しました</p></div>';
    }
  },

  renderCaseList(data) {
    const { cases, total, page, totalPages } = data;
    const { tag, year, sort } = this.state;

    // Active filter chips
    let filtersHtml = '';
    if (tag || year) {
      filtersHtml = '<div class="active-filters">';
      if (tag) filtersHtml += `<div class="filter-chip">🏷️ ${this.esc(tag)} <span class="remove" onclick="App.clearFilter('tag')">×</span></div>`;
      if (year) filtersHtml += `<div class="filter-chip">📅 ${year}年 <span class="remove" onclick="App.clearFilter('year')">×</span></div>`;
      filtersHtml += '</div>';
    }

    const sortButtons = [
      ['updated', '更新順'],
      ['year_desc', '新しい事件'],
      ['year_asc', '古い事件'],
      ['views', '注目順'],
      ['posts', '議論順'],
    ].map(([key, label]) =>
      `<button class="${sort === key ? 'active' : ''}" onclick="App.setSort('${key}')">${label}</button>`
    ).join('');

    let listHtml = '';
    if (cases.length === 0) {
      listHtml = '<div class="empty-state"><div class="empty-icon">🔍</div><p>該当する事件が見つかりませんでした</p></div>';
    } else {
      const caseItems = cases.map((c, idx) => {
        const tags = (c.tags || '').split(',').filter(Boolean).slice(0, 4).map(t =>
          `<span class="tag">${this.esc(t.trim())}</span>`
        ).join('');
        const postCount = c.post_count || c.post_count_cache || 0;
        let html = `
          <a href="/case/${c.slug}" class="case-item" data-link>
            <div class="case-year">
              <span class="year-label">年</span>
              ${c.year || '?'}
            </div>
            <div class="case-info">
              <div class="case-title">${this.esc(c.title)}</div>
              <div class="case-summary">${this.esc(c.summary || '')}</div>
              <div class="case-tags">${tags}</div>
            </div>
            <div class="case-meta-right">
              <div class="case-post-count">${postCount}</div>
              <div class="case-post-label">議論</div>
              <div class="case-views">👁 ${c.view_count || 0}</div>
            </div>
          </a>`;
        // 10件目の後に記事内広告を挿入
        if (idx === 9 && cases.length > 10) {
          html += `</div>
          <div class="ad-in-content">
            <div class="ad-container">
              <!-- AdSense: 記事一覧内 (responsive) -->
              <!-- <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script> -->
              <div class="ad-placeholder">広告スペース</div>
            </div>
          </div>
          <div class="case-list">`;
        }
        return html;
      }).join('');
      listHtml = '<div class="case-list">' + caseItems + '</div>';
    }

    // Pagination
    let pagHtml = '';
    if (totalPages > 1) {
      pagHtml = '<div class="pagination">';
      if (page > 1) pagHtml += `<button onclick="App.setPage(${page - 1})">‹ 前</button>`;
      const start = Math.max(1, page - 3);
      const end = Math.min(totalPages, page + 3);
      for (let i = start; i <= end; i++) {
        pagHtml += `<button class="${i === page ? 'active' : ''}" onclick="App.setPage(${i})">${i}</button>`;
      }
      if (page < totalPages) pagHtml += `<button onclick="App.setPage(${page + 1})">次 ›</button>`;
      pagHtml += '</div>';
    }

    document.getElementById('app').innerHTML = `
      ${filtersHtml}
      <div class="sort-bar">
        <div class="result-count"><strong>${total}</strong> 件の事件</div>
        <div class="sort-buttons">${sortButtons}</div>
      </div>
      ${listHtml}
      ${pagHtml}
    `;
  },

  // --- Filters ---
  setSort(sort) {
    this.state.sort = sort;
    this.state.page = 1;
    this.loadCases();
  },

  setTag(tag) {
    this.state.tag = this.state.tag === tag ? '' : tag;
    this.state.page = 1;
    this.loadCases();
    this.updateTagButtons();
    this.updateYearButtons();
  },

  setYear(year) {
    this.state.year = this.state.year === String(year) ? '' : String(year);
    this.state.page = 1;
    this.loadCases();
    this.updateTagButtons();
    this.updateYearButtons();
  },

  clearFilter(type) {
    this.state[type] = '';
    this.state.page = 1;
    this.loadCases();
    this.updateTagButtons();
    this.updateYearButtons();
  },

  setPage(page) {
    this.state.page = page;
    this.loadCases();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  updateTagButtons() {
    document.querySelectorAll('.tag-cloud .tag-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tag === this.state.tag);
    });
  },

  updateYearButtons() {
    document.querySelectorAll('.year-list .year-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.year === this.state.year);
    });
  },

  // --- Case Detail ---
  async renderCasePage(slug) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading">読み込み中</div>';

    try {
      const data = await this.api(`/api/cases/${slug}`);
      const c = data.case;
      const posts = data.posts;

      const tags = (c.tags || '').split(',').filter(Boolean).map(t =>
        `<span class="tag" onclick="App.navigate('/'); App.setTag('${this.esc(t.trim())}')">${this.esc(t.trim())}</span>`
      ).join('');

      // SEO: ページタイトル・meta動的更新
      document.title = `${c.title} - 日本犯罪データベース`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.content = (c.summary || '').substring(0, 160);

      app.innerHTML = `
        <div class="breadcrumb">
          <a href="/" data-link>事件一覧</a>
          <span class="sep">›</span>
          <span>${this.esc(c.title)}</span>
        </div>

        <div class="case-detail">
          <div class="case-header">
            <h2>${this.esc(c.title)}</h2>
            <div class="case-meta-info">
              <span class="year-badge">${c.year || '不明'}年</span>
              <span>閲覧 ${c.view_count}</span>
              <span>議論 ${posts.length}件</span>
            </div>
            <div class="case-detail-tags">${tags}</div>
            <div class="case-body">${this.esc(c.summary || '')}</div>
          </div>

          <!-- 広告: 記事下 -->
          <div class="ad-in-content">
            <div class="ad-container">
              <!-- AdSense: 記事下 (responsive) -->
              <!-- <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script> -->
              <div class="ad-placeholder">広告スペース</div>
            </div>
          </div>

          <div class="posts-section">
            <h3>議論・考察 (${posts.length}件)</h3>
            ${posts.length === 0 ? '<div class="empty-state"><div class="empty-icon">💬</div><p>まだ議論がありません。最初のコメントを投稿しましょう。</p></div>' : ''}
            ${posts.map((p, i) => `
              <div class="post-item">
                <div class="post-header">
                  <div>
                    <span class="post-number">&gt;&gt;${i + 1}</span>
                    <span class="post-author">${this.esc(p.author_name)}</span>
                  </div>
                  <span class="post-date">${this.formatDate(p.created_at)}</span>
                </div>
                <div class="post-body">${this.formatContent(p.content)}</div>
              </div>
            `).join('')}
          </div>

          <!-- 広告: 投稿一覧下 -->
          ${posts.length > 3 ? `
          <div class="ad-in-content">
            <div class="ad-container">
              <!-- AdSense: コメント下 (responsive) -->
              <!-- <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script> -->
              <div class="ad-placeholder">広告スペース</div>
            </div>
          </div>` : ''}

          <div class="reply-form-card">
            <h3>この事件について議論する</h3>
            <form id="replyForm">
              <div class="form-group">
                <label>名前（空欄で「名無しの探偵」）</label>
                <input type="text" id="replyAuthor" placeholder="名無しの探偵" maxlength="30">
              </div>
              <div class="form-group">
                <label>コメント</label>
                <textarea id="replyContent" required placeholder="事件についての考察、情報、意見を書いてください..." rows="5" maxlength="5000"></textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary">投稿する</button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.getElementById('replyForm').addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitReply(slug);
      });
    } catch (e) {
      app.innerHTML = '<div class="empty-state"><p>事件が見つかりませんでした</p></div>';
    }
  },

  async submitReply(slug) {
    const author = document.getElementById('replyAuthor').value;
    const content = document.getElementById('replyContent').value;
    if (!content.trim()) { this.showToast('本文を入力してください', 'error'); return; }

    try {
      await this.apiPost(`/api/cases/${slug}/posts`, { author_name: author, content });
      this.showToast('投稿しました', 'success');
      this.renderCasePage(slug);
      this.loadStats();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  // --- Stats ---
  async loadStats() {
    try {
      const s = await this.api('/api/stats');
      document.getElementById('statCases').textContent = s.caseCount;
      document.getElementById('statPosts').textContent = s.postCount;
    } catch (e) {}
  },

  // --- Tags sidebar ---
  async loadTags() {
    try {
      const tags = await this.api('/api/tags');
      document.getElementById('tagCloud').innerHTML = tags.slice(0, 25).map(t =>
        `<button class="tag-btn" data-tag="${this.esc(t.name)}" onclick="App.setTag('${this.esc(t.name)}')">${this.esc(t.name)} <span class="tag-count">${t.count}</span></button>`
      ).join('');
    } catch (e) {}
  },

  // --- Years sidebar ---
  async loadYears() {
    try {
      const years = await this.api('/api/years');
      document.getElementById('yearList').innerHTML = years.map(y =>
        `<button class="year-btn" data-year="${y}" onclick="App.setYear(${y})">${y}</button>`
      ).join('');
    } catch (e) {}
  },

  // --- Static Pages (AdSense審査必須) ---
  renderStaticPage(page) {
    const pages = {
      about: {
        title: 'このサイトについて',
        content: `
          <h2>日本犯罪データベースについて</h2>
          <p>「日本犯罪データベース」は、日本国内で発生した犯罪事件、特に未解決事件を中心に情報を収集・整理し、事件に関する考察や議論を行うためのプラットフォームです。</p>

          <h3>サイトの目的</h3>
          <p>本サイトは以下の目的で運営されています：</p>
          <ul>
            <li>日本の犯罪事件に関する正確な情報の記録と保存</li>
            <li>未解決事件への社会的関心の維持</li>
            <li>事件に関する建設的な考察・議論の場の提供</li>
            <li>犯罪防止への意識啓発</li>
          </ul>

          <h3>収録事件数</h3>
          <p>現在、209件以上の犯罪事件を収録しています。各事件には詳細な説明文、発生年、カテゴリタグが付与されており、検索やフィルタリングで簡単に目的の事件を見つけることができます。</p>

          <h3>免責事項</h3>
          <p>本サイトに掲載されている情報は、公開されている報道資料や文献に基づいています。情報の正確性には細心の注意を払っていますが、完全性を保証するものではありません。事件に関する最新情報は、警察発表や公式報道をご確認ください。</p>

          <h3>運営者情報</h3>
          <p>運営者：日本犯罪データベース管理人<br>お問い合わせ：<a href="/contact" data-link>お問い合わせページ</a>よりご連絡ください。</p>
        `
      },
      privacy: {
        title: 'プライバシーポリシー',
        content: `
          <h2>プライバシーポリシー</h2>
          <p>日本犯罪データベース（以下「当サイト」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本プライバシーポリシーは、当サイトにおける情報の収集・利用・管理について定めるものです。</p>

          <h3>1. 収集する情報</h3>
          <p>当サイトでは、以下の情報を収集する場合があります：</p>
          <ul>
            <li><strong>投稿情報</strong>：掲示板への投稿時に入力される名前（ニックネーム）およびコメント内容</li>
            <li><strong>アクセスログ</strong>：IPアドレス、ブラウザの種類、アクセス日時、閲覧ページ</li>
            <li><strong>Cookie情報</strong>：サイトの利便性向上および広告配信のためにCookieを使用します</li>
          </ul>

          <h3>2. 広告について</h3>
          <p>当サイトでは、第三者配信の広告サービス（Google AdSense）を利用しています。</p>
          <ul>
            <li>Google AdSenseは、ユーザーの興味に応じた広告を表示するためにCookieを使用することがあります</li>
            <li>Google AdSenseによるCookieの利用については、<a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener">Google広告に関するポリシー</a>をご覧ください</li>
            <li>ユーザーは、<a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Googleの広告設定ページ</a>から、パーソナライズ広告を無効にすることができます</li>
          </ul>

          <h3>3. Amazonアソシエイトについて</h3>
          <p>当サイトは、Amazon.co.jpを宣伝しリンクすることによってサイトが紹介料を獲得できる手段を提供することを目的に設定されたアフィリエイトプログラムである、Amazonアソシエイト・プログラムの参加者です。</p>

          <h3>4. アクセス解析ツールについて</h3>
          <p>当サイトでは、Googleによるアクセス解析ツール「Google Analytics」を使用する場合があります。Google Analyticsはデータの収集のためにCookieを使用しています。このデータは匿名で収集されており、個人を特定するものではありません。</p>

          <h3>5. 個人情報の第三者提供</h3>
          <p>当サイトは、法令に基づく場合を除き、ユーザーの個人情報を本人の同意なく第三者に提供することはありません。</p>

          <h3>6. プライバシーポリシーの変更</h3>
          <p>当サイトは、必要に応じてプライバシーポリシーを変更することがあります。変更後のポリシーは当ページにて公開します。</p>

          <p class="policy-date">最終更新日：2026年4月15日</p>
        `
      },
      rules: {
        title: '利用規約',
        content: `
          <h2>利用規約</h2>
          <p>日本犯罪データベース（以下「当サイト」）のご利用にあたっては、以下の利用規約に同意いただいたものとみなします。</p>

          <h3>第1条（禁止事項）</h3>
          <p>当サイトの利用にあたり、以下の行為を禁止します：</p>
          <ul>
            <li>個人情報（被害者・加害者・関係者の個人を特定できる未公開情報）の投稿</li>
            <li>被害者・遺族への誹謗中傷や侮辱的な表現</li>
            <li>犯罪行為を助長・教唆・賞賛する内容の投稿</li>
            <li>根拠のない誹謗中傷、デマ、虚偽情報の拡散</li>
            <li>わいせつな内容、差別的表現の投稿</li>
            <li>広告・スパム・営業目的の投稿</li>
            <li>当サイトの運営を妨害する行為</li>
            <li>その他、法令に違反する行為</li>
          </ul>

          <h3>第2条（投稿内容について）</h3>
          <ul>
            <li>投稿された内容は、管理者の判断により予告なく削除される場合があります</li>
            <li>投稿内容の著作権は投稿者に帰属しますが、当サイトでの表示・保存に必要な範囲で利用を許諾いただきます</li>
            <li>投稿者は、投稿内容に関する一切の責任を負うものとします</li>
          </ul>

          <h3>第3条（免責事項）</h3>
          <ul>
            <li>当サイトの情報は可能な限り正確を期していますが、その完全性・正確性を保証するものではありません</li>
            <li>当サイトの利用により生じた損害について、運営者は一切の責任を負いません</li>
            <li>当サイトは予告なく内容の変更、サービスの中断・終了を行う場合があります</li>
          </ul>

          <h3>第4条（著作権）</h3>
          <p>当サイトに掲載されているコンテンツ（文章、画像、デザインなど）の著作権は、当サイト運営者または正当な権利者に帰属します。無断転載・複製を禁じます。</p>

          <h3>第5条（準拠法）</h3>
          <p>本規約は日本法に準拠して解釈されるものとします。</p>

          <p class="policy-date">最終更新日：2026年4月15日</p>
        `
      },
      contact: {
        title: 'お問い合わせ',
        content: `
          <h2>お問い合わせ</h2>
          <p>当サイトに関するお問い合わせは、以下のフォームまたはメールアドレスにてお願いいたします。</p>

          <h3>お問い合わせ内容の例</h3>
          <ul>
            <li>事件情報の訂正・追加依頼</li>
            <li>不適切な投稿の報告</li>
            <li>著作権に関するお問い合わせ</li>
            <li>広告掲載に関するお問い合わせ</li>
            <li>その他サイト運営に関するご意見・ご要望</li>
          </ul>

          <div class="contact-form-card">
            <form id="contactForm" onsubmit="App.submitContact(event)">
              <div class="form-group">
                <label>お名前</label>
                <input type="text" id="contactName" required placeholder="お名前">
              </div>
              <div class="form-group">
                <label>メールアドレス</label>
                <input type="email" id="contactEmail" required placeholder="example@mail.com">
              </div>
              <div class="form-group">
                <label>お問い合わせ内容</label>
                <textarea id="contactMessage" required placeholder="お問い合わせ内容をご記入ください..." rows="6"></textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary">送信する</button>
              </div>
            </form>
          </div>

          <p class="contact-note">※ お問い合わせへの返信には数日いただく場合がございます。</p>
        `
      }
    };

    const p = pages[page];
    if (!p) { this.navigate('/'); return; }

    document.title = `${p.title} - 日本犯罪データベース`;
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="breadcrumb">
        <a href="/" data-link>事件一覧</a>
        <span class="sep">›</span>
        <span>${p.title}</span>
      </div>
      <div class="static-page">
        ${p.content}
      </div>
    `;
  },

  submitContact(e) {
    e.preventDefault();
    this.showToast('お問い合わせを送信しました。ありがとうございます。', 'success');
    document.getElementById('contactForm').reset();
  },

  // --- Utils ---
  showToast(msg, type = 'success') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
  },

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  },

  formatContent(text) {
    let e = this.esc(text);
    e = e.replace(/&gt;&gt;(\d+)/g, '<span class="post-number">&gt;&gt;$1</span>');
    return e;
  },

  formatDate(ds) {
    if (!ds) return '';
    const d = new Date(ds + (ds.includes('Z') || ds.includes('+') ? '' : 'Z'));
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    if (hrs < 24) return `${hrs}時間前`;
    if (days < 30) return `${days}日前`;
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
