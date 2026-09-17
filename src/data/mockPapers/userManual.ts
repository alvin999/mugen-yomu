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
  venue: 'Official System Documentation · BETA',
  arxivId: 'MUGEN-GUIDE-2026',
  citations: 'Interactive Spec',
  readingSpeedWpm: 240,
  depthLevel: 'Cognitive Synthesis',
  abstract: {
    english:
      'MUGEN YOMU (無限閱讀) is a cognitive scholar reading workbench designed to empower researchers and engineers to truly comprehend complex academic literature rather than merely translating words. Grounded in the Cognitive Scholar Gruvbox design system, the architecture integrates a synchronized Triad Reading Space—comprising the dynamic Reading Map, the Bilingual Scholarly Canvas equipped with a real-time Focus Lens, and a quad-layer AI Cognitive Companion. This operational manual outlines the fundamental reading mechanics, the Subject-Verb-Object (SVO) deconstruction engine, interactive mathematical sandboxes, and the privacy-first Bring-Your-Own-Key (BYOK) local caching paradigm.',
    chineseSummary:
      'MUGEN YOMU（無限閱讀）是一款專為學術研究者、工程師與研究生打造的認知伴讀型學術工作台。本系統徹底摒棄傳統機械式逐字生硬翻譯，致力於「幫助讀者跨越專業門檻，真正讀懂原文論證脈絡」。本操作手冊全面引導讀者掌握三欄工作台架構（導航地圖、雙語畫布與聚焦透鏡、四層認知伴讀助理）、長難句 SVO 語法拆解、互動公式沙盒以及極致隱私的自備金鑰（BYOK）本機快取加速機制。'
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
        'MUGEN YOMU is established upon a singular guiding principle: "Not translating the whole paper away, but empowering readers to surmount domain barriers, truly comprehend the original text, grasp the context, and explore continuously." By marrying classical library contemplation with Unix-style terminal minimalism, the system minimizes cognitive load and elevates scientific reading flow.'
      ]
    },
    {
      id: '2',
      title: '2. The Triad Reading Space Architecture',
      level: 1,
      page: 2,
      progress: 100,
      isRead: true,
      paragraphs: [
        'The core interface is arranged as a tripartite cognitive space engineered for sustained immersion: the Reading Map on the left, the Bilingual Scholarly Canvas at the center, and the AI Cognitive Companion on the right. Each region maintains precise temporal and spatial synchronization with the reader’s gaze.',
        'The workspace supports three distinct operational modes: Cognitive Bilingual (the primary multi-column study view with SVO deconstruction and real-time AI companion), Zen Reading (a distraction-free single column maximizing scholarly typography), and Derivations & Figures (side-by-side juxtaposition of structural diagrams and mathematical proofs).'
      ]
    },
    {
      id: '3',
      title: '3. Cognitive Reading Mechanics & The Focus Lens',
      level: 1,
      page: 2,
      progress: 60,
      isRead: false,
      paragraphs: [
        'To shield researchers from information saturation when navigating dense multi-page treatises, MUGEN YOMU deploys the Focus Lens mechanism. As the reader navigates through sections, the active paragraph is elevated against the warm Gruvbox canvas (#32302f) with an amber vertical accent (#fe8019), naturally focusing visual attention while soft-fading peripheral paragraphs.'
      ],
      children: [
        {
          id: '3.1',
          title: '3.1 Reading Flow & Saccadic Tracking',
          level: 2,
          page: 3,
          progress: 100,
          isRead: true,
          paragraphs: [
            'The top Density Ribbon continuously computes the reader’s comprehension pace (reading words per minute) and visual dwelling density. This telemetry dynamically updates the progress heatmap in the Reading Map, demarcating verified sections with scholar green checks while tracing incomplete explorations.'
          ]
        },
        {
          id: '3.2',
          title: '3.2 Complex Sentence Deconstruction (The SVO Engine)',
          level: 2,
          page: 3,
          progress: 80,
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
              number: '(1)',
              name: 'Cognitive Reading & Cache Efficiency Model',
              latexText: '\\eta_{\\text{reading}} = \\frac{C_{\\text{comp}} \\cdot (1 + \\gamma_{\\text{cache}})}{\\ln(\\tau_{\\text{lat}} + 1) \\cdot \\sqrt{\\Omega_{\\text{svo}}}}',
              page: 'p. 3',
              sectionId: '3.2',
              sectionTitle: '3.2 Cognitive Load Reduction via SVO Parsing & Caching',
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
          id: '3.3',
          title: '3.3 Interactive Formula Sandbox & Notation System',
          level: 2,
          page: 4,
          progress: 0,
          isRead: false,
          paragraphs: [
            'Mathematical expressions are rendered as interactive cognitive sandboxes rather than static bitmaps. Every variable within the LaTeX formula is color-coded to Gruvbox academic tokens and equipped with tooltip glosses, allowing readers to inspect algebraic semantics without thumbing back to symbol definition appendices.'
          ]
        }
      ]
    },
    {
      id: '4',
      title: '4. The Quad-Layer AI Companion',
      level: 1,
      page: 4,
      progress: 0,
      isRead: false,
      paragraphs: [
        'The right column houses the AI Cognitive Companion, engineered with four structured analytical modalities: Scientific Intuition (illuminating the motivating "why" behind theoretical choices), Syntax Tree (mapping syntactic dependencies with bilingual alignment), Terminology Alignment (disambiguating overloaded technical terms), and Socratic Inquiries (proactively generating deep theoretical questions to stimulate critical inquiry).',
        'At the base of the companion, readers can engage in multi-turn contextual dialogues powered by ultra-fast local or cloud inference (such as Groq LPU or Gemini), and export structured annotations directly into their personal research knowledge repository.'
      ]
    },
    {
      id: '5',
      title: '5. Privacy-First BYOK & Local Caching Paradigm',
      level: 1,
      page: 5,
      progress: 0,
      isRead: false,
      paragraphs: [
        'MUGEN YOMU operates under a strict Zero-Server Knowledge philosophy: "Your documents. Your AI. Your keys." The browser client connects directly to AI provider endpoints (Groq, OpenAI, Anthropic, Gemini, DeepSeek) using user-supplied API tokens stored exclusively in the browser’s local storage.',
        'To protect users with free-tier API quotas or strict rate limits, the system incorporates a viewport-first progressive scheduler and an IndexedDB caching store. By prioritizing only visible paragraphs and persisting analytical outputs locally, token consumption is reduced by up to 82%.'
      ]
    },
    {
      id: '6',
      title: '6. Workflow Mastery & Keyboard Shortcuts',
      level: 1,
      page: 5,
      progress: 0,
      isRead: false,
      paragraphs: [
        'Researchers can ingest literature via four complementary pathways: live web URL extraction (via Jina Reader), curated classic presets, raw Markdown/plain-text pasting, or structured JSON file uploads.',
        'For fluid navigation, keyboard shortcuts empower power users to toggle reading modes, jump between section anchors, trigger Socratic prompts, and export notes with minimal friction.'
      ]
    }
  ],
  companionData: {
    '3.2': {
      intuition: {
        title: '為什麼長難句拆解是學術精讀的關鍵突破口？',
        tag: 'Cognitive Science',
        content: [
          '學術論文為了追求論證嚴謹性，常在單一句子中嵌套多個從屬子句、分詞修飾與介系詞片語。傳統機器翻譯會打亂原文語序硬翻為中文，使讀者喪失對關鍵概念指涉與邏輯因果的敏感度。',
          'SVO 語法拆解引擎將句子直接分解為「主幹 S-V-O」、「方式與修飾」及「目的與結果」，使讀者瞬間捕捉論證重心，並大幅降低工作記憶體負擔。'
        ]
      },
      syntaxTree: {
        line: 'Section 3.2 · Core Manual',
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
        { term: 'Focus Lens', zh: '聚焦透鏡', explanation: '以琥珀光暈突顯當前研讀段落，抑制周邊視覺干擾', color: '#fe8019' },
        { term: 'SVO Engine', zh: '主幹語法拆解', explanation: '將長難句分解為主謂賓、修飾與目的核心語法樹', color: '#8ec07c' },
        { term: 'BYOK Architecture', zh: '自帶金鑰架構', explanation: '金鑰與文本零上傳伺服器，完全於本機瀏覽器端安全推論', color: '#fabd2f' },
        { term: 'Saccadic Tracking', zh: '眼動掃視追蹤', explanation: '估算眼動速率與覆蓋率，洞察讀者專注曲線', color: '#83a598' }
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
        },
        {
          id: 'q_manual_3',
          icon: 'palette',
          color: 'text-[#fe8019]',
          text: '為什麼 Cognitive Scholar Gruvbox 暖色暗調配色比傳統科技藍更適合長篇論文精讀？',
          answerSummary:
            'Gruvbox 採用暖墨暗調（#282828 底色與 #ebdbb2 羊皮紙文字），大幅消除了冷光藍光對視網膜的強烈刺激，在長達數小時的論文深讀中顯著減緩視覺疲勞，維持高度專注的心流狀態。'
        }
      ]
    },
    '1': {
      intuition: {
        title: 'MUGEN YOMU 的核心產品定位是什麼？',
        tag: 'Vision & Goal',
        content: [
          '傳統翻譯工具將英文全部覆蓋為中文，讀者看似看懂了，卻無法建立起英文學術交流與閱讀原文的能力。',
          'MUGEN YOMU 的定位是「認知伴讀型工作台」，透過段落錨定、術語對齊與長難句拆解，幫助讀者跨過語言門檻，真正看懂原文。'
        ]
      },
      terminology: [
        { term: 'Cognitive Scholar', explanation: '結合古典圖書館沉靜與現代駭客終端之設計規範', color: '#fe8019' },
        { term: 'Triad Workspace', explanation: '閱讀地圖、學術畫布、認知伴讀三欄協同架構', color: '#fabd2f' }
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
    }
  }
};
