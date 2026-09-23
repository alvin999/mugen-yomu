import type { PaperDocument } from '../../types/document';

// -------------------------------------------------------------
// 核心內建文獻: MUGEN YOMU 英文使用說明書 (Official Operating Manual)
// -------------------------------------------------------------
export const userManualDocument: PaperDocument = {
  id: 'mugen_yomu_user_manual',
  type: 'paper',
  title: 'MUGEN YOMU: Operating Manual & Cognitive Reading System Guide',
  sourceUrl: 'https://github.com/alvin999/mugen-yomu',
  pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf', // 預設提供 Attention PDF 作為對照範例
  authors: [
    'MUGEN YOMU Architecture Team*',
    'Cognitive Scholar Research Lab*'
  ],
  venue: 'Official System Documentation · v2.0',
  arxivId: 'MUGEN-GUIDE-2026',
  citations: 'Interactive Spec',
  readingSpeedWpm: 260,
  depthLevel: 'Cognitive Synthesis',
  abstract: {
    english:
      'MUGEN YOMU (無限閱讀) is an immersive academic literature and technical documentation AI copilot engineered for deep contextual comprehension rather than superficial summarization. Grounded in the cognitive psychology principle that fingertip-guided visual pacing diminishes regressions and induces flow, the system marries Unix-style terminal minimalism with the Cognitive Scholar Gruvbox design language. The architecture integrates native Vim keyboard navigation with a dynamic physical smear cursor, a synchronized bilingual canvas equipped with a real-time Focus Lens, deep Subject-Verb-Object (SVO) syntactic deconstruction, interactive LaTeX mathematical sandboxes, an offline in-browser PDF engine, and a privacy-first Bring-Your-Own-Key (BYOK) local caching paradigm.',
    chineseSummary:
      'MUGEN YOMU（無限閱讀）是一款專為深度理解而生的沉浸式學術論文與技術文件 AI 伴讀工具。基於《如何閱讀一本書》中「指尖引導視線能顯著減少視線回跳並誘導心流」的認知心理學原理，系統將 Unix 終端極簡美學與 Cognitive Scholar Gruvbox 典雅色系深度結合。架構整合了原生 Vim 鍵盤導航與動態物理拖尾游標（Smear Cursor）、雙語同步對照畫布與即時聚焦透鏡（Focus Lens）、長難句 SVO 核心語法拆解、互動式 KaTeX 數學公式沙盒、本機離線 PDF 解析引擎，以及極致隱私的自備金鑰（BYOK）本機快取加速機制。'
  },
  sections: [
    {
      id: '1',
      title: '1. Overview & Architectural Philosophy',
      level: 1,
      page: 1,
      progress: 100,
      isRead: true,
      paragraphs: [
        'Scholarly reading has long been hindered by a fundamental dilemma between full-text machine translation and conversational summarization agents. Traditional translation engines mechanically substitute sentences, frequently shattering mathematical typography, obscuring nuanced academic terminology, and disconnecting readers from the precise original discourse. Conversely, conversational chatbots produce fragmented, decontextualized overviews before readers even comprehend what questions to ask.',
        'MUGEN YOMU is established upon a singular guiding principle: "Not translating the whole paper away, but empowering readers to surmount domain barriers, truly comprehend the original text, grasp the context, and explore continuously." In Mortimer J. Adler\'s classical treatise "How to Read a Book", using a finger or pointer to pace visual reading significantly reduces involuntary eye saccades and regressions. MUGEN YOMU digitizes this visual pacing psychology into engineer-native Vim navigation, converting keyboard cadences into an unbroken cognitive reading flow.'
      ]
    },
    {
      id: '2',
      title: '2. The Triad Reading Space & Bilingual Synchronization',
      level: 1,
      page: 2,
      progress: 100,
      isRead: true,
      paragraphs: [
        'The core interface is arranged as a tripartite cognitive space engineered for sustained immersion: the Reading Map on the left, the Bilingual Scholarly Canvas at the center, and the AI Cognitive Companion on the right. Each region maintains precise temporal and spatial synchronization with the reader’s gaze.',
        'The Bilingual Canvas coordinates original English discourse alongside aligned Traditional Chinese translations. When the user scrolls or navigates via keyboard, both columns maintain exact section and paragraph alignment. The Focus Lens softly dims peripheral sections while accentuating the active paragraph with an amber vertical indicator (#fe8019), protecting readers from visual fatigue and information overload across dense treatises.'
      ]
    },
    {
      id: '3',
      title: '3. Vim Navigation & Dynamic Smear Cursor',
      level: 1,
      page: 2,
      progress: 80,
      isRead: false,
      paragraphs: [
        'At the core of MUGEN YOMU’s flow experience is the Neovim-inspired navigation system and status bar. Readers manipulate their viewing focus without taking their hands off the home row, steering visual attention across lines, paragraphs, and semantic blocks with surgical precision.'
      ],
      children: [
        {
          id: '3.1',
          title: '3.1 Directional Movement & Word Navigation',
          level: 2,
          page: 3,
          progress: 100,
          isRead: true,
          paragraphs: [
            'Readers utilize classical directional keystrokes: j / k to traverse vertically down and up across paragraphs and lines; h / l to traverse horizontally character by character while ignoring non-visible markup; w / b to jump forward and backward by semantic word boundaries; 0 / $ to snap to the line beginning or end; and gg / G to instantly teleport to the top or bottom of the entire document.',
            'A lightweight Neovim-style status bar anchored at the bottom edge provides real-time telemetry: the active mode (-- NORMAL -- or -- COGNITIVE --), current paragraph index, word-count progress, active bounce strength, and blink rate.'
          ]
        },
        {
          id: '3.2',
          title: '3.2 Smear Cursor Physics & Dynamic Damping',
          level: 2,
          page: 3,
          progress: 70,
          isRead: false,
          paragraphs: [
            'The dynamic Vim cursor is rendered through an in-browser requestAnimationFrame physical simulation loop. Unlike static cursor squares, it features dynamic velocity-saturated squash-and-stretch deformations, 3D perspective trapezoidal tilts, and distance-adaptive damping to eliminate whip-tailing when jumping across long wrap-arounds.',
            'Readers can customize Bounce Strength (0% to 100%) in the settings modal. At low strengths (e.g. 5%), the physics engine activates an overdamped non-oscillatory regime (Δ > 0) with zero overshoot and crisp ease-out arrival; at higher strengths (e.g. 60%~90%), it gracefully transitions into an underdamped elastic spring, exhibiting vivid, fluid bounce and momentum.'
          ],
          formulas: [
            {
              id: 'eq_cursor_spring',
              number: '(1)',
              name: 'Adaptive Overdamped Spring-Damper State Equation',
              latexText: 'v_{t+1} = \\left(v_t + k_{\\text{stiff}} \\cdot \\Delta x\\right) \\cdot \\mu_{\\text{damp}}',
              page: 'p. 3',
              sectionId: '3.2',
              sectionTitle: '3.2 Smear Cursor Physics & Dynamic Damping',
              sourceContextSnippet: 'The discrete cursor kinematics govern smooth traversal across characters, switching dynamically between overdamped absorption and underdamped oscillation.',
              variables: [
                { symbol: 'v_{t+1}', meaning: '下一幀動態游標速度 (Next Velocity)', color: '#fe8019' },
                { symbol: 'k_{\\text{stiff}}', meaning: '自適應彈簧剛性係數 (Stiffness)', color: '#b8bb26' },
                { symbol: '\\Delta x', meaning: '當前游標與目標字符距離向量 (Distance Error)', color: '#fabd2f' },
                { symbol: '\\mu_{\\text{damp}}', meaning: '動態速度保留率 / 慣性阻尼係數 (Retention)', color: '#83a598' }
              ]
            }
          ]
        },
        {
          id: '3.3',
          title: '3.3 Interactive Keystrokes & Cheatsheet',
          level: 2,
          page: 3,
          progress: 90,
          isRead: true,
          paragraphs: [
            'Beyond spatial navigation, specialized single-key commands accelerate academic comprehension: pressing t toggles the Traditional Chinese translation fold for the active paragraph; pressing a awakens the AI Cognitive Companion to deconstruct the current sentence; pressing y yanks the original paragraph or LaTeX formula to the system clipboard; and pressing ? toggles the floating Vim Cheatsheet card for instant keybindings reference.'
          ]
        }
      ]
    },
    {
      id: '4',
      title: '4. Deep Comprehension & The SVO Engine',
      level: 1,
      page: 4,
      progress: 60,
      isRead: false,
      paragraphs: [
        'Academic literature routinely features convoluted sentences burdened with nested relative clauses, participial modifiers, and passive voice constructions. The SVO Deconstruction Engine parses these syntactical mazes into distinct cognitive capsules: the grammatical core (Subject-Verb-Object), auxiliary conditional modifiers, and intentional purpose/result clauses.',
        'Whenever an intricate sentence is detected within the active Focus Lens, an interactive badge illuminates above the text. Readers can trigger the inline semantic action toolbar to request instant plain-language scientific intuitions, syntactic deconstruction trees, terminology alignments, or pin markdown study notes.'
      ],
      svoSentence: {
        sentence:
          'By decomposing syntactically intricate academic sentences into explicit subject-verb-object kernels, the cognitive parser enables researchers to swiftly assimilate core technical arguments without succumbing to cognitive overload.',
        svoBadge: '長難句拆解 (SVO)',
        subjectVerbObject: {
          title: '[主幹 S-V-O]',
          en: 'the cognitive parser enables researchers to swiftly assimilate core technical arguments',
          zh: '認知解析引擎使研究人員能夠迅速吸收核心技術論點'
        },
        modifier: {
          title: '[方式與條件]',
          en: 'By decomposing syntactically intricate academic sentences into explicit subject-verb-object kernels',
          zh: '透過將句法結構複雜的學術長句拆解為明確的主謂賓核心'
        },
        purpose: {
          title: '[目的與結果]',
          en: 'without succumbing to cognitive overload',
          zh: '從而避免大腦陷入資訊過載的疲乏困境'
        }
      },
      formulas: [
        {
          id: 'eq_efficiency',
          number: '(2)',
          name: 'Cognitive Reading & Cache Efficiency Model',
          latexText: '\\eta_{\\text{reading}} = \\frac{C_{\\text{comp}} \\cdot (1 + \\gamma_{\\text{cache}})}{\\ln(\\tau_{\\text{lat}} + 1) \\cdot \\sqrt{\\Omega_{\\text{svo}}}}',
          page: 'p. 4',
          sectionId: '4',
          sectionTitle: '4. Deep Comprehension & The SVO Engine',
          sourceContextSnippet: 'We formulate the cognitive reading efficiency as a function of contextual comprehension, cache retrieval, and syntactic sentence complexity.',
          variables: [
            { symbol: '\\eta_{\\text{reading}}', meaning: '綜合精讀效能指標 (Cognitive Efficiency)', color: '#fe8019' },
            { symbol: 'C_{\\text{comp}}', meaning: '原文脈絡理解深度 (0~100%)', color: '#b8bb26' },
            { symbol: '\\gamma_{\\text{cache}}', meaning: '本機快取重複命中率 (預設 82%)', color: '#fabd2f' },
            { symbol: '\\tau_{\\text{lat}}', meaning: 'AI 推論延遲時間 (毫秒)', color: '#83a598' },
            { symbol: '\\sqrt{\\Omega_{\\text{svo}}}', meaning: '長難句語法複雜度阻抗係數', color: '#8ec07c' }
          ]
        }
      ]
    },
    {
      id: '5',
      title: '5. The Quad-Layer AI Companion',
      level: 1,
      page: 4,
      progress: 40,
      isRead: false,
      paragraphs: [
        'The right column houses the AI Cognitive Companion, engineered with four structured analytical modalities: Scientific Intuition (illuminating the motivating "why" behind theoretical choices), Syntax Tree (mapping syntactic dependencies with bilingual alignment), Terminology Alignment (disambiguating overloaded technical terms), and Socratic Inquiries (proactively generating deep theoretical questions to stimulate critical inquiry).',
        'At the base of the companion, readers can engage in multi-turn contextual dialogues powered by ultra-fast local or cloud inference (such as Groq LPU, OpenAI, Gemini, Anthropic, or DeepSeek), and export structured annotations directly into their personal research knowledge repository.'
      ]
    },
    {
      id: '6',
      title: '6. Zero-Server BYOK & Multi-Source Import Paradigm',
      level: 1,
      page: 5,
      progress: 20,
      isRead: false,
      paragraphs: [
        'MUGEN YOMU operates under a strict Zero-Server Knowledge philosophy: "Your documents. Your AI. Your keys." The browser client connects directly to AI provider endpoints using user-supplied API tokens stored exclusively in the browser’s local storage. Neither documents nor credentials ever touch an intermediary server.',
        'To support flexible scholarly workflows, literature can be ingested via four pathways: in-browser offline PDF parsing powered by pdfjs-dist, live web URL extraction via Jina Reader, direct arXiv API search, or raw Markdown / plain-text pasting. The viewport-first progressive scheduler and IndexedDB cache store reduce token consumption by up to 82%.'
      ]
    }
  ],
  companionData: {
    '1': {
      intuition: {
        title: 'MUGEN YOMU 的核心產品定位是什麼？',
        tag: 'Vision & Philosophy',
        content: [
          '傳統翻譯工具將英文全部覆蓋為中文，讀者看似看懂了，卻無法建立起英文學術交流與閱讀原文的能力。',
          'MUGEN YOMU 的定位是「認知伴讀型工作台」，透過段落錨定、術語對齊與長難句拆解，幫助讀者跨過語言門檻，真正看懂原文。'
        ]
      },
      terminology: [
        { term: 'Cognitive Scholar', zh: '認知伴讀規範', explanation: '結合古典圖書館沉靜與現代終端之 Gruvbox 設計規範', color: '#fe8019' },
        { term: 'Triad Workspace', zh: '三欄工作台', explanation: '閱讀地圖、學術畫布、認知伴讀三欄協同架構', color: '#fabd2f' }
      ],
      socraticQuestions: [
        {
          id: 'q_ov_1',
          icon: 'help_outline',
          color: 'text-[#fe8019]',
          text: '為什麼說全篇逐字翻譯往往無法真正理解頂尖論文？',
          answerSummary: '頂會論文中包含大量前沿專有名詞、數學定義與論證邏輯。逐字翻譯常遺失精確語義脈絡，唯有雙語對照伴讀才能建立真正的學術理解。'
        }
      ]
    },
    '2': {
      intuition: {
        title: '雙語同步滾動如何輔助心流？',
        tag: 'Cognitive Ergonomics',
        content: [
          '傳統分頁或單欄切換會強迫大腦在「原文頁」與「譯文頁」之間來回跳轉，造成嚴重的注意力中斷（Context Switching）。',
          '雙語同步滾動與 Focus Lens 讓視線在英中對照之間毫無延遲地自由位移，原文嚴謹性與中文吸收速度得以兼得。'
        ]
      },
      terminology: [
        { term: 'Focus Lens', zh: '聚焦透鏡', explanation: '以琥珀光暈突顯當前研讀段落，抑制周邊視覺干擾', color: '#fe8019' },
        { term: 'Sync Scroll', zh: '同步捲動', explanation: '左右雙欄精確對齊同一語意段落，消除閱讀視差', color: '#b8bb26' }
      ],
      socraticQuestions: [
        {
          id: 'q_bi_1',
          icon: 'sync_alt',
          color: 'text-[#8ec07c]',
          text: '聚焦透鏡（Focus Lens）如何降低長篇論文的認知過載？',
          answerSummary: '透過暖色暗調背景弱化周邊段落、將視覺權重集中於當前段落，引導視神經維持高密度專注。'
        }
      ]
    },
    '3': {
      intuition: {
        title: '為什麼將指尖引導視線（Pacing）與 Vim 結合？',
        tag: 'Flow State Psychology',
        content: [
          '《如何閱讀一本書》強調指尖導引能有效穩定眼球掃視、減少無意識倒退（Regression）。',
          'Vim 的 hjkl 鍵位將眼球掃視動作轉化為工程師肌肉記憶，讓閱讀從「被動接收」變成「主動探索」，迅速沉浸入專注心流。'
        ]
      },
      syntaxTree: {
        line: 'Section 3 · Vim Navigation',
        snippet: 'MUGEN YOMU marries Unix-style terminal minimalism with dynamic physical pacing to elevate scientific reading flow.',
        svo: [
          { role: '[主幹 S-V-O]', text: 'MUGEN YOMU marries minimalism with physical pacing', zh: 'MUGEN YOMU 將極簡美學與物理導引相結合', color: 'text-[#fe8019]' },
          { role: '[目的與結果]', text: 'to elevate scientific reading flow', zh: '從而顯著提升科學文獻閱讀心流', color: 'text-[#8ec07c]' }
        ]
      },
      terminology: [
        { term: 'Smear Cursor', zh: '動態拖尾游標', explanation: '具備速度飽和形變與 3D 梯形透視的實體感游標', color: '#fe8019' },
        { term: 'Bounce Strength', zh: '彈跳強度', explanation: '自 0% 瞬移、5% 過阻尼平滑吸附到 90% 彈簧活潑回彈之物理調校', color: '#fabd2f' },
        { term: 'Neovim Status Bar', zh: 'Neovim 狀態列', explanation: '底部顯示模式、段落座標、字數進度與物理狀態之極簡條', color: '#83a598' }
      ],
      socraticQuestions: [
        {
          id: 'q_vim_1',
          icon: 'keyboard',
          color: 'text-[#fe8019]',
          text: '為什麼 Bounce Strength 在低強度（如 5%）時需要採用「過阻尼」設計？',
          answerSummary: '過阻尼在數學上判別式大於零，特徵根無虛數部，確保游標以極致柔順的 Ease-Out 曲線迅速就位，完全杜絕任何震盪與晃動，完美銜接 0% 瞬移感。'
        },
        {
          id: 'q_vim_2',
          icon: 'speed',
          color: 'text-[#b8bb26]',
          text: 'Vim 導航如何協助讀者快速跳轉長篇文獻結構？',
          answerSummary: '透過 j/k 垂直行進、w/b 語義單詞跳躍、0/$ 行首行尾定位與 gg/G 全篇跳轉，雙手不離鍵盤即可精確巡覽論文脈絡。'
        }
      ]
    },
    '4': {
      intuition: {
        title: '為什麼長難句拆解是學術精讀的關鍵突破口？',
        tag: 'Cognitive Science',
        content: [
          '學術論文為了追求論證嚴謹性，常在單一句子中嵌套多個從屬子句、分詞修飾與介系詞片語。傳統機器翻譯會打亂原文語序硬翻為中文，使讀者喪失對關鍵概念指涉與邏輯因果的敏感度。',
          'SVO 語法拆解引擎將句子直接分解為「主幹 S-V-O」、「方式與修飾」及「目的與結果」，使讀者瞬間捕捉論證重心，並大幅降低工作記憶體負擔。'
        ]
      },
      syntaxTree: {
        line: 'Section 4 · Core Manual',
        snippet:
          'By decomposing syntactically intricate academic sentences into explicit subject-verb-object kernels, the cognitive parser enables researchers to swiftly assimilate core technical arguments without succumbing to cognitive overload.',
        svo: [
          {
            role: '[主幹 S-V-O]',
            text: 'the cognitive parser enables researchers to swiftly assimilate...',
            zh: '認知解析引擎使研究人員能迅速吸收核心論點',
            color: 'text-[#fe8019]'
          },
          {
            role: '[方式與條件]',
            text: 'By decomposing syntactically intricate sentences...',
            zh: '透過將複雜句式拆解為主謂賓核心',
            color: 'text-[#fabd2f]'
          },
          {
            role: '[目的與結果]',
            text: 'without succumbing to cognitive overload',
            zh: '從而避免大腦陷入資訊過載疲乏',
            color: 'text-[#8ec07c]'
          }
        ]
      },
      terminology: [
        { term: 'SVO Engine', zh: '主幹語法拆解', explanation: '將長難句分解為主謂賓、修飾與目的核心語法樹', color: '#8ec07c' },
        { term: 'Formula Sandbox', zh: '互動公式沙盒', explanation: '彩色標註 LaTeX 符號語義與懸浮解說的互動數學環境', color: '#fe8019' }
      ],
      socraticQuestions: [
        {
          id: 'q_svo_1',
          icon: 'account_tree',
          color: 'text-[#fabd2f]',
          text: '長難句拆解如何幫助非英語母語讀者建立英文學術思維？',
          answerSummary: 'SVO 拆解不替換原文語序，而是凸顯主從關係。讀者一目了然看見主幹與修飾，邊讀邊吸收道地的學術修辭架構。'
        }
      ]
    },
    '5': {
      intuition: {
        title: '四層伴讀如何重現頂尖學術導師的引導？',
        tag: 'Pedagogical Design',
        content: [
          '一個优秀的導師不會只給學生標準答案，而是會先給予直覺背景（Scientific Intuition），拆解關鍵句法（Syntax Tree），辨析專有名詞（Terminology），最後提出深度問題激發思辨（Socratic Inquiries）。',
          '這四層分析由淺入深，層層遞進，確保讀者不是「被動閱讀」，而是「深度內化」。'
        ]
      },
      terminology: [
        { term: 'Scientific Intuition', zh: '科學直覺', explanation: '解釋論文設計背後的工程動機與直覺思路', color: '#fe8019' },
        { term: 'Socratic Inquiries', zh: '蘇格拉底提問', explanation: '提出批判性延伸問題，檢視論點邊界條件', color: '#8ec07c' }
      ],
      socraticQuestions: [
        {
          id: 'q_comp_1',
          icon: 'psychology',
          color: 'text-[#b8bb26]',
          text: '為什麼蘇格拉底式提問對於論文閱讀至關重要？',
          answerSummary: '論文的真正價值往往在於其侷限性、未言明的前提假設與未來的延伸空間。主動回答引導性問題能鍛鍊批判性思維。'
        }
      ]
    },
    '6': {
      intuition: {
        title: '為什麼堅持 Zero-Server 與 BYOK 架構？',
        tag: 'Security & Privacy',
        content: [
          '學術研究往往涉及尚未發布的實驗成果、專利技術與高度敏感的資料。上傳至第三方中介伺服器存在巨大的洩密隱患。',
          'MUGEN YOMU 堅持「你的文件、你的金鑰、你的本機」，瀏覽器直接以使用者的 Token 與 AI 供應商連線，打造真正安全無虞的研讀環境。'
        ]
      },
      terminology: [
        { term: 'Zero-Server Knowledge', zh: '零伺服器知識', explanation: '純客戶端架構，任何中介伺服器皆無法接觸文獻與金鑰', color: '#b8bb26' },
        { term: 'BYOK Architecture', zh: '自帶金鑰架構', explanation: '金鑰與文本零上傳伺服器，完全於本機瀏覽器端安全推論', color: '#fabd2f' },
        { term: 'In-Browser PDF.js', zh: '瀏覽器端離線 PDF', explanation: '於本地快速提取雙欄文獻章節大綱與排版', color: '#83a598' }
      ],
      socraticQuestions: [
        {
          id: 'q_manual_1',
          icon: 'lock',
          color: 'text-[#b8bb26]',
          text: 'MUGEN YOMU 如何在零伺服器（Zero-Server）架構下確保論文隱私與數據安全？',
          answerSummary:
            '所有文獻解析、IndexedDB 快取與 AI 呼叫皆完全在讀者瀏覽器內部執行，金鑰僅存放於本地，任何第三方或中介伺服器皆無法接觸到使用者的文獻內容與金鑰。'
        },
        {
          id: 'q_manual_2',
          icon: 'speed',
          color: 'text-[#fabd2f]',
          text: '在免費或有 Rate Limit 的 API 條件下，漸進式排程器如何達成 82% 的快取節省？',
          answerSummary:
            '系統採用視口優先（Viewport-first）漸進式排程，僅優先處理當前讀者正在研讀的段落，並將伴讀分析與語法拆解深度持久化於本機，避免一次性消耗整篇論文的 Token 額度。'
        }
      ]
    }
  }
};
