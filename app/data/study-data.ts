export type Character = {
  id: string;
  name: string;
  image: string;
};

export type Movie = {
  id: string;
  title: string;
  poster: string;
  durationSeconds: number;
  characters: Character[];
};

export type Claim = {
  id: string;
  text: string;
  role: 'core' | 'context';
};

export type StudyQuestion = {
  id: string;
  movieId: string;
  category: string;
  holder: string;
  question: string;
  answer: string;
  anchor: { sceneId: string; start: number; end: number };
  clip: { url: string; sourceStart: number; duration: number };
  claims: Claim[];
};

export const movies: Movie[] = [
  {
    id: 'american-fiction-2023',
    title: 'American Fiction',
    poster: '/media/american_fiction/poster.jpg',
    durationSeconds: 7019.471,
    characters: [
      {
        id: 'monk',
        name: 'Monk',
        image: '/media/american_fiction/characters/monk_01.jpg',
      },
      {
        id: 'lisa',
        name: 'Lisa',
        image: '/media/american_fiction/characters/lisa_01.jpg',
      },
      {
        id: 'cliff',
        name: 'Cliff',
        image: '/media/american_fiction/characters/cliff_01.jpg',
      },
      {
        id: 'coraline',
        name: 'Coraline',
        image: '/media/american_fiction/characters/coraline_01.jpg',
      },
      {
        id: 'arthur',
        name: 'Arthur',
        image: '/media/american_fiction/characters/arthur_01.jpg',
      },
      {
        id: 'agnes',
        name: 'Agnes',
        image: '/media/american_fiction/characters/agnes_01.jpg',
      },
    ],
  },
  {
    id: 'challengers-2024',
    title: 'Challengers',
    poster: '/media/challengers/poster.jpg',
    durationSeconds: 7898.349,
    characters: [
      {
        id: 'tashi',
        name: 'Tashi',
        image: '/media/challengers/characters/tashi_01.jpg',
      },
      {
        id: 'art',
        name: 'Art',
        image: '/media/challengers/characters/art_01.jpg',
      },
      {
        id: 'patrick',
        name: 'Patrick',
        image: '/media/challengers/characters/patrick_01.jpg',
      },
    ],
  },
  {
    id: 'fair-play-2023',
    title: 'Fair Play',
    poster: '/media/fair_play/poster.jpg',
    durationSeconds: 6808.75,
    characters: [
      {
        id: 'emily',
        name: 'Emily',
        image: '/media/fair_play/characters/emily_01.jpg',
      },
      {
        id: 'luke',
        name: 'Luke',
        image: '/media/fair_play/characters/luke_01.jpg',
      },
      {
        id: 'campbell',
        name: 'Campbell',
        image: '/media/fair_play/characters/campbell_01.jpg',
      },
      {
        id: 'paul',
        name: 'Paul',
        image: '/media/fair_play/characters/paul_01.jpg',
      },
      {
        id: 'rory',
        name: 'Rory',
        image: '/media/fair_play/characters/rory_01.jpg',
      },
    ],
  },
  {
    id: 'poker-face-101-dead-mans-hand-2023',
    title: 'Poker Face — S01E01',
    poster: '/media/poker_face_s01e01/poster.jpg',
    durationSeconds: 4026.356,
    characters: [
      {
        id: 'charlie',
        name: 'Charlie',
        image: '/media/poker_face_s01e01/characters/charlie_01.jpg',
      },
      {
        id: 'sterling',
        name: 'Sterling',
        image: '/media/poker_face_s01e01/characters/sterling_01.jpg',
      },
      {
        id: 'cliff-legrand',
        name: 'Cliff Legrand',
        image: '/media/poker_face_s01e01/characters/cliff_legrand_01.jpg',
      },
      {
        id: 'natalie',
        name: 'Natalie',
        image: '/media/poker_face_s01e01/characters/natalie_01.jpg',
      },
    ],
  },
];

export const studyQuestions: StudyQuestion[] = [
  {
    id: 'american-fiction-2023_Q2_CORALINE WILSON_s_070_0',
    movieId: 'american-fiction-2023',
    category: 'Q2 · Realization',
    holder: 'Coraline Wilson',
    question:
      'At the bocce court, what does Coraline come to understand about Cliff’s black eye?',
    answer:
      'Coraline had previously believed that Cliff’s black eye came from a fight. At the bocce court, Cliff directly tells her the story of how he got it, changing her understanding. She realizes that the black eye actually came from a clumsy encounter with a male partner involving yogurt, not from a fight. That awkward, yogurt-related encounter is the explanation she accepts for the injury.',
    anchor: { sceneId: 's_070', start: 4473.471, end: 4557.763 },
    clip: {
      url: '/media/evidence/american-coraline-bocce.mp4',
      sourceStart: 4468.471,
      duration: 94.292,
    },
    claims: [
      {
        id: 'c1',
        text: 'Coraline previously believed that Cliff’s black eye came from a fight.',
        role: 'context',
      },
      {
        id: 'c2',
        text: 'Cliff directly tells Coraline how Cliff got the black eye.',
        role: 'context',
      },
      {
        id: 'c3',
        text: 'Cliff’s black eye resulted from a clumsy encounter with a male partner.',
        role: 'core',
      },
      {
        id: 'c4',
        text: 'Yogurt was involved in the encounter that caused Cliff’s black eye.',
        role: 'core',
      },
    ],
  },
  {
    id: 'american-fiction-2023_Q4_ARTHUR_s_054_0',
    movieId: 'american-fiction-2023',
    category: 'Q4 · Source attribution',
    holder: 'Arthur',
    question:
      'At Arthur’s office during Agnes’s visit, how does Arthur gauge Monk’s attitude toward Wiley’s expected persona?',
    answer:
      'Arthur gauges Monk’s attitude by watching what Monk does after Arthur describes Wiley’s expected persona. Monk sits down instead of immediately complying, and he delays leaving. Arthur takes the sitting down as evidence of Monk’s attitude. He likewise treats the delayed departure, rather than immediate compliance, as revealing. To Arthur, the delay signals Monk’s resistance to playing the stereotypical fugitive persona Arthur has described.',
    anchor: { sceneId: 's_054', start: 3625.457, end: 3722.095 },
    clip: {
      url: '/media/evidence/american-arthur-office.mp4',
      sourceStart: 3620.457,
      duration: 106.638,
    },
    claims: [
      {
        id: 'c1',
        text: 'Arthur gauges Monk’s attitude by observing that Monk sits down instead of immediately complying.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Arthur gauges Monk’s attitude by observing that Monk delays leaving.',
        role: 'context',
      },
      {
        id: 'c3',
        text: 'Monk’s delay signals resistance to playing the stereotypical fugitive persona Arthur described.',
        role: 'core',
      },
    ],
  },
  {
    id: 'american-fiction-2023_Q7_LISA_s_017_0',
    movieId: 'american-fiction-2023',
    category: 'Q7 · Deception detection',
    holder: 'Lisa',
    question:
      'At the restaurant, what does Lisa make of Monk’s account of their father’s travel and their mother’s forgetfulness?',
    answer:
      'At the restaurant, Lisa takes Monk’s account of their father at face value. She believes that Monk truly did not know about their father’s affairs, and she also believes that he had accepted the explanation that their father was away at conferences. She is much less receptive about their mother: Lisa rejects Monk’s effort to minimize the forgetfulness by saying it did not necessarily mean illness.',
    anchor: { sceneId: 's_017', start: 823.199, end: 920.462 },
    clip: {
      url: '/media/evidence/american-lisa-restaurant.mp4',
      sourceStart: 818.199,
      duration: 107.263,
    },
    claims: [
      {
        id: 'c1',
        text: 'Lisa believes Monk did not know about their father’s affairs.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Lisa believes Monk had accepted their father’s explanation that he was traveling to conferences.',
        role: 'core',
      },
      {
        id: 'c3',
        text: 'Lisa rejects Monk’s suggestion that their mother’s forgetfulness does not necessarily indicate illness.',
        role: 'core',
      },
    ],
  },
  {
    id: 'challengers-2024_Q4_PATRICK ZWEIG_s_051_0',
    movieId: 'challengers-2024',
    category: 'Q4 · Source attribution',
    holder: 'Patrick Zweig',
    question:
      'In the sauna before their championship match, how does Art learn Patrick’s wishes for it?',
    answer:
      'In the sauna, Patrick Zweig tells Art Donaldson directly what he wants for their championship match. His request is explicit: Patrick asks Art not to defeat him decisively. Art does not have to infer Patrick’s wishes from hints or circumstances; he learns them from Patrick’s own direct statement, with Patrick plainly asking Art to avoid a decisive victory over him in the match.',
    anchor: { sceneId: 's_051', start: 5354.133, end: 5422.164 },
    clip: {
      url: '/media/evidence/challengers-patrick-sauna.mp4',
      sourceStart: 5349.133,
      duration: 78.031,
    },
    claims: [
      {
        id: 'c1',
        text: 'Patrick Zweig tells Art Donaldson directly what Patrick wants.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Patrick Zweig explicitly asks Art Donaldson not to defeat Patrick decisively in the match.',
        role: 'core',
      },
    ],
  },
  {
    id: 'challengers-2024_Q7_TASHI DONALDSON_s_043_0',
    movieId: 'challengers-2024',
    category: 'Q7 · Deception detection',
    holder: 'Tashi Donaldson',
    question:
      "At the Mason Applebee's, what does Tashi make of Art's reasons for offering her the assistant-coach job?",
    answer:
      'Tashi believes Art genuinely wants her as his assistant coach. She also thinks guilt over Patrick and her injury partly motivates him to make the offer. Even so, she sees his desire to win as the main motive, rather than guilt alone. Tashi also accepts Art’s direct admission that he is still in love with her. For her, guilt matters, but it remains secondary to winning.',
    anchor: { sceneId: 's_043', start: 4574.049, end: 4725.498 },
    clip: {
      url: '/media/evidence/challengers-tashi-applebees.mp4',
      sourceStart: 4605.498,
      duration: 125,
    },
    claims: [
      {
        id: 'c1',
        text: 'Tashi Donaldson believes Art Donaldson genuinely wants Tashi Donaldson as his assistant coach.',
        role: 'context',
      },
      {
        id: 'c2',
        text: 'Tashi Donaldson believes guilt over Patrick Zweig and Tashi Donaldson’s injury partly motivates Art Donaldson.',
        role: 'core',
      },
      {
        id: 'c3',
        text: 'Tashi Donaldson believes Art Donaldson’s main motive is winning, rather than guilt alone.',
        role: 'core',
      },
      {
        id: 'c4',
        text: 'Tashi Donaldson believes Art Donaldson is still in love with Tashi Donaldson.',
        role: 'core',
      },
    ],
  },
  {
    id: 'challengers-2024_Q8_ART DONALDSON_s_069_0',
    movieId: 'challengers-2024',
    category: 'Q8 · Temporal ordering',
    holder: 'Art Donaldson',
    question:
      'In what order does Art piece together Patrick and Tashi’s connection, culminating in the final tie-break?',
    answer:
      'First, Patrick tells Art that he is sexually attracted to Tashi. Later, Patrick uses their agreed serving tic, nonverbally confirming to Art that he has slept with her. Years afterward, Art sees Patrick and Tashi sharing a private, intimate moment at the Atlanta hotel bar. Finally, during the tie-break, Art recognizes Patrick’s old service signal and underhand feed as an attempt to restore their shared intensity, rather than merely to provoke him.',
    anchor: { sceneId: 's_069', start: 7172.876, end: 7342.578 },
    clip: {
      url: '/media/evidence/challengers-art-tiebreak.mp4',
      sourceStart: 7222.578,
      duration: 125,
    },
    claims: [
      {
        id: 'c1',
        text: 'Patrick tells Art that Patrick is sexually attracted to Tashi.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Patrick’s agreed serving tic nonverbally confirms to Art that Patrick slept with Tashi.',
        role: 'core',
      },
      {
        id: 'c3',
        text: 'Art sees Patrick and Tashi sharing a private, intimate moment.',
        role: 'core',
      },
      {
        id: 'c4',
        text: 'Art recognizes Patrick’s old service signal and underhand feed as an attempt to restore their shared intensity, not merely provoke Art.',
        role: 'core',
      },
    ],
  },
  {
    id: 'fair-play-2023_Q4_EMILY_s_021_0',
    movieId: 'fair-play-2023',
    category: 'Q4 · Source attribution',
    holder: 'Emily',
    question:
      'At Luke’s desk after the broken-glass cleanup, how do Emily and Luke each learn about Quinn’s replacement?',
    answer:
      'After the broken-glass cleanup, Emily is at Luke’s desk when she overhears two colleagues discussing Quinn’s replacement: Campbell plans to promote Luke. Emily therefore gets the news by overhearing their conversation, rather than from Luke. Luke learns it differently. Emily tells him directly, leaning in and whispering the news to him. So Emily hears the colleagues’ discussion first, and Luke receives the same information from Emily’s whisper.',
    anchor: { sceneId: 's_021', start: 864.65, end: 884.9 },
    clip: {
      url: '/media/evidence/fairplay-emily-desk.mp4',
      sourceStart: 859.65,
      duration: 30.25,
    },
    claims: [
      {
        id: 'c1',
        text: 'Emily overhears two colleagues saying Campbell plans to promote Luke.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Luke learns directly from Emily when Emily whispers the news to Luke.',
        role: 'core',
      },
    ],
  },
  {
    id: 'fair-play-2023_Q3_EMILY_s_030_0',
    movieId: 'fair-play-2023',
    category: 'Q3 · Belief state',
    holder: 'Emily',
    question:
      "At home late at night after meeting Campbell, how does Emily read Luke's response to her promotion?",
    answer:
      'At home, Emily takes Luke’s response at face value. She reads his congratulations and affection as sincere signs that he is genuinely happy about the promotion and supportive of her advancement. But her interpretation is wrong: Luke is concealing how threatened he feels by her new position, particularly in relation to his own career, rather than sharing the uncomplicated happiness she sees in him.',
    anchor: { sceneId: 's_030', start: 1319.32, end: 1407.74 },
    clip: {
      url: '/media/evidence/fairplay-emily-promotion.mp4',
      sourceStart: 1314.32,
      duration: 98.42,
    },
    claims: [
      {
        id: 'c1',
        text: 'Emily believes Luke is genuinely happy about her promotion.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Emily believes Luke supports her advancement.',
        role: 'core',
      },
      {
        id: 'c3',
        text: 'Emily’s interpretation of Luke’s response is mistaken.',
        role: 'context',
      },
      {
        id: 'c4',
        text: 'Luke conceals feeling threatened by Emily’s new position relative to his own career.',
        role: 'context',
      },
    ],
  },
  {
    id: 'fair-play-2023_Q7_CAMPBELL_s_048_0',
    movieId: 'fair-play-2023',
    category: 'Q7 · Deception detection',
    holder: 'Campbell',
    question:
      'At the Midtown bar, what does Campbell make of Emily’s case for Luke?',
    answer:
      'Campbell accepts the factual part of Emily’s pitch: he believes her account that Luke made the big short on Brick the previous month. But he does not accept the conclusion she draws from it, rejecting her claim that Luke is valuable to her team. Campbell’s view is that Luke was hired as a favor and will eventually be forced out regardless of that recent success.',
    anchor: { sceneId: 's_048', start: 2146.86, end: 2204.32 },
    clip: {
      url: '/media/evidence/fairplay-campbell-bar.mp4',
      sourceStart: 2141.86,
      duration: 67.46,
    },
    claims: [
      {
        id: 'c1',
        text: 'Campbell accepts Emily’s account that Luke made the big short on Brick the previous month.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Campbell rejects Emily’s claim that Luke is valuable to her team.',
        role: 'core',
      },
      {
        id: 'c3',
        text: 'Campbell says Luke was hired as a favor.',
        role: 'core',
      },
      {
        id: 'c4',
        text: 'Campbell says Luke will eventually be forced out regardless of his recent success.',
        role: 'core',
      },
    ],
  },
  {
    id: 'poker-face-101-dead-mans-hand-2023_Q4_CHARLIE CALE_s_033_0',
    movieId: 'poker-face-101-dead-mans-hand-2023',
    category: 'Q4 · Source attribution',
    holder: 'Charlie Cale',
    question:
      'Outside her trailer with John-O, how does Charlie know what he has heard about the dark web?',
    answer:
      'Charlie knows because she and John-O hear the disturbing report together as it plays from her phone. She is present for the same broadcast and hears it at the same time he does. His awareness is therefore firsthand: Charlie does not recount the report to him or tell him separately what it said. They receive the report together from the phone.',
    anchor: { sceneId: 's_033', start: 579.343, end: 630.234 },
    clip: {
      url: '/media/evidence/poker-charlie-darkweb.mp4',
      sourceStart: 574.343,
      duration: 60.891,
    },
    claims: [
      {
        id: 'c1',
        text: 'Charlie Cale and John-O hear the disturbing report together.',
        role: 'core',
      },
      {
        id: 'c2',
        text: "The disturbing report plays from Charlie Cale's phone.",
        role: 'core',
      },
      {
        id: 'c3',
        text: 'John-O’s awareness does not come from Charlie Cale recounting the disturbing report.',
        role: 'context',
      },
    ],
  },
  {
    id: 'poker-face-101-dead-mans-hand-2023_Q7_CHARLIE CALE_s_051_0',
    movieId: 'poker-face-101-dead-mans-hand-2023',
    category: 'Q7 · Deception detection',
    holder: 'Charlie Cale',
    question:
      'In Sterling’s office, with Cliff and Natalie waiting outside, what does Charlie make of Sterling’s authority over the poker operation?',
    answer:
      'Charlie does not accept Sterling’s claim that he has the authority to approve the poker operation on his own. She treats his say-so as insufficient, even though he tells her otherwise. For Charlie, the operation still requires confirmation from Sterling Frost Sr.: she insists on knowing that his father has approved it rather than taking Sterling’s assertion as authorization by itself.',
    anchor: { sceneId: 's_051', start: 1581.82, end: 1671.749 },
    clip: {
      url: '/media/evidence/poker-charlie-authority.mp4',
      sourceStart: 1576.82,
      duration: 99.929,
    },
    claims: [
      {
        id: 'c1',
        text: 'Charlie does not believe Sterling can authorize the poker operation by himself.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Sterling tells Charlie that Sterling can authorize the poker operation by himself.',
        role: 'context',
      },
      {
        id: 'c3',
        text: 'Charlie insists on confirmation that Sterling Frost Sr. approved the poker operation.',
        role: 'core',
      },
    ],
  },
  {
    id: 'poker-face-101-dead-mans-hand-2023_Q3_STERLING_s_084_0',
    movieId: 'poker-face-101-dead-mans-hand-2023',
    category: 'Q3 · Belief state',
    holder: 'Sterling',
    question:
      'In Sterling’s office with Cliff and the remote, what does Sterling make of Charlie’s grasp of the photograph and phone call?',
    answer:
      'Sterling’s assessment is that Charlie understands the photograph only at a superficial level; he does not appreciate how far she has connected it to the conspiracy. He also treats her questions about the phone call as personal anxiety rather than deduction. In reality, Charlie has already deduced that Sterling lied about the call. Sterling has therefore underestimated her understanding on both fronts.',
    anchor: { sceneId: 's_084', start: 2902.051, end: 3108.738 },
    clip: {
      url: '/media/evidence/poker-sterling-office.mp4',
      sourceStart: 2988.738,
      duration: 125,
    },
    claims: [
      {
        id: 'c1',
        text: 'Sterling assumes Charlie understands the photograph only superficially.',
        role: 'core',
      },
      {
        id: 'c2',
        text: 'Sterling treats Charlie’s questions about the call as personal anxiety rather than deduction.',
        role: 'core',
      },
      {
        id: 'c3',
        text: 'Charlie has deduced that Sterling lied about the call.',
        role: 'context',
      },
      {
        id: 'c4',
        text: 'Sterling underestimates how far Charlie has connected the photograph to the conspiracy.',
        role: 'context',
      },
    ],
  },
];

export const movieById = Object.fromEntries(
  movies.map((movie) => [movie.id, movie]),
);
