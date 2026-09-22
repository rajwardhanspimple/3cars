// Presentation/record identities only. Both worlds use the unchanged circuit.
export const DEFAULT_TRACK = 'anime-night-city-v1';
export const MOUNTAIN_TRACK = 'mountain-preview-v1';
export const TRACKS = Object.freeze({
 [DEFAULT_TRACK]: Object.freeze({
  id: DEFAULT_TRACK, name: 'Midnight City', label: 'Anime night city',
  title: 'Race through the night.',
  intro: 'Three full-detail Mustang racers on a neon-lit city circuit. Hold Space to slide, steer through the corner, then boost off the exit. Two AI rivals race with you.',
  recordsKey: '3cars.records.anime-night-city-v1'
 }),
 [MOUNTAIN_TRACK]: Object.freeze({
  id: MOUNTAIN_TRACK, name: 'Sakura Pass', label: 'Daytime mountain circuit',
  title: 'Race the mountain road.',
  intro: 'Three full-detail Mustang racers on the mountain circuit in daylight cel colours. Hold Space to slide, steer through the corner, then boost off the exit. Two AI rivals race with you.',
  recordsKey: '3cars.records.mountain-preview-v1'
 })
});
export const isTrack = id => Object.hasOwn(TRACKS, id);
export const trackInfo = id => TRACKS[isTrack(id) ? id : DEFAULT_TRACK];
