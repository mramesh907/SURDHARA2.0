const ytCover = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const tracks = [
  {
    id: 'tomake-chai', title: 'Tomake Chai', artist: 'Arijit Singh', artistIds: ['arijit-singh'],
    album: 'Gangster', movie: 'Gangster', musicDirector: 'Arindom', lyricist: 'Prasen', year: 2016,
    genre: 'Romantic', language: 'Bengali', youtubeId: 'JAP_Acr8jUM', cover: ytCover('JAP_Acr8jUM'),
    duration: '4:42', mood: 'romantic',
  },
  {
    id: 'bojhena-arijit', title: 'Bojhena Shey Bojhena', artist: 'Arijit Singh', artistIds: ['arijit-singh'],
    album: 'Bojhena Shey Bojhena', movie: 'Bojhena Shey Bojhena', musicDirector: 'Indraadip Das Gupta', lyricist: 'Prasen', year: 2012,
    genre: 'Romantic', language: 'Bengali', youtubeId: '8KSiDa-ZkuA', cover: ytCover('8KSiDa-ZkuA'),
    duration: '5:18', mood: 'romantic',
  },
  {
    id: 'bojhena-zubeen', title: 'Bojhena Shey Bojhena', artist: 'Zubeen Garg', artistIds: ['zubeen-garg'],
    album: 'Prem Amar', movie: 'Prem Amar', musicDirector: 'Jeet Gannguli', lyricist: 'Goutam Susmit', year: 2009,
    genre: 'Melody', language: 'Bengali', youtubeId: 'EMGnzU2F9fk', cover: ytCover('EMGnzU2F9fk'),
    duration: '4:21', mood: 'classic',
  },
  {
    id: 'ki-kore-toke-bolbo', title: 'Ki Kore Toke Bolbo', artist: 'Papon, Palak Muchhal', artistIds: ['papon', 'palak-muchhal'],
    album: 'Ki Kore Toke Bolbo', movie: 'Ki Kore Toke Bolbo', musicDirector: 'Jeet Gannguli', lyricist: 'Prasen', year: 2016,
    genre: 'Melody', language: 'Bengali', youtubeId: 'c8CZsRmkysg', cover: ytCover('c8CZsRmkysg'),
    duration: '4:09', mood: 'romantic',
  },
  {
    id: 'awaara-dil', title: 'Awaara Dil', artist: 'Vicky A Khan, Madhuraa Bhattacharya', artistIds: ['vicky-a-khan', 'madhuraa-bhattacharya'],
    album: 'Ki Kore Toke Bolbo', movie: 'Ki Kore Toke Bolbo', musicDirector: 'Dev Sen', lyricist: 'Prasen', year: 2016,
    genre: 'Chill', language: 'Bengali', youtubeId: 'azMLXbArheg', cover: ytCover('azMLXbArheg'),
    duration: '3:56', mood: 'chill',
  },
];

export const playlists = [
  {
    id: 'romantic-evening', title: 'Romantic Evening', subtitle: 'Songs for the moments that matter',
    description: 'Warm melodies, heartfelt vocals, and songs made for a little daydreaming.',
    cover: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85',
    trackIds: ['tomake-chai', 'bojhena-arijit', 'ki-kore-toke-bolbo', 'awaara-dil'], mood: 'romantic',
    badge: 'MADE FOR YOU',
  },
  {
    id: 'timeless-classics', title: 'Timeless Classics', subtitle: 'Familiar tunes, lasting feelings',
    description: 'Memorable voices and evergreen melodies to return to anytime.',
    cover: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85',
    trackIds: ['bojhena-zubeen', 'bojhena-arijit', 'tomake-chai'], mood: 'classic', badge: 'EDITOR\'S PICK',
  },
  {
    id: 'slow-and-soft', title: 'Slow & Soft', subtitle: 'Take a moment to unwind',
    description: 'Easy listening for quiet evenings, slow mornings, and everything between.',
    cover: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85',
    trackIds: ['awaara-dil', 'tomake-chai', 'ki-kore-toke-bolbo'], mood: 'chill', badge: 'CHILL MIX',
  },
  {
    id: 'cinema-soundtrack', title: 'Cinema Soundtrack', subtitle: 'Stories told through music',
    description: 'Songs connected to the scenes and stories we remember.',
    cover: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85',
    trackIds: ['tomake-chai', 'bojhena-arijit', 'bojhena-zubeen', 'ki-kore-toke-bolbo', 'awaara-dil'], mood: 'all',
  },
  {
    id: 'melody-room', title: 'The Melody Room', subtitle: 'For the melody-first listener',
    description: 'Gentle hooks and expressive vocals collected in one place.',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=900&q=85',
    trackIds: ['ki-kore-toke-bolbo', 'awaara-dil', 'bojhena-arijit'], mood: 'chill',
  },
];

export const artists = [
  { id: 'arijit-singh', name: 'Arijit Singh', bio: 'A celebrated playback singer known for expressive vocals and memorable melodies.', image: '' },
  { id: 'zubeen-garg', name: 'Zubeen Garg', bio: 'A multi-lingual singer, composer, and performer with a distinctive voice.', image: '' },
  { id: 'papon', name: 'Papon', bio: 'A singer and composer known for blending contemporary sounds with rich melodies.', image: '' },
  { id: 'palak-muchhal', name: 'Palak Muchhal', bio: 'A playback singer recognized for her melodic and emotive performances.', image: '' },
  { id: 'vicky-a-khan', name: 'Vicky A Khan', bio: 'A playback singer featured across Bengali film soundtracks.', image: '' },
  { id: 'madhuraa-bhattacharya', name: 'Madhuraa Bhattacharya', bio: 'A playback singer known for her work in Bengali music.', image: '' },
];

export const moods = [
  { id: 'all', label: 'All music' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'chill', label: 'Chill' },
  { id: 'classic', label: 'Classics' },
];
