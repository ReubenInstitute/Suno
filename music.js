import WaveSurfer from '/wavesurfer/wavesurfer.esm.js';

function fmtTime(s) {
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return m + ':' + sec.toString().padStart(2, '0');
}

Handlebars.registerHelper('fmtTime', fmtTime);

export class Track {
	constructor(id, data) {
		this.id = id;
		this.data = data;
		this.psalm = null;
	}
}

export class Library {
	constructor() {
		this.tracks = [];
		this._tracks = {};
	}

	async load() {
		const [tracksResp, psalmsResp] = await Promise.all([
			fetch('/tracks.json'),
			fetch('/psalms.csv'),
		]);
		const json = await tracksResp.json();
		const csv = await psalmsResp.text();
		const psalmById = {};
		const lines = csv.split('\n');
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line)
				continue;
			const [psalmStr, id] = line.split(',');
			const psalm = parseInt(psalmStr, 10);
			if (!isNaN(psalm) && id)
				psalmById[id] = psalm;
		}
		for (const data of json) {
			const id = data.id;
			if (!id)
				continue;
			const track = new Track(id, data);
			track.psalm = psalmById[id] || null;
			this.tracks.push(track);
			this._tracks[id] = track;
		}
		const psalms = this.tracks.filter(t => t.psalm).sort((a, b) => a.psalm - b.psalm);
		const others = this.tracks.filter(t => !t.psalm);
		this.tracks = [...psalms, ...others];
	}
}

export class TracksView {
	static TEMPLATE = `
<table>
	<tr>
		<th></th>
		<th>Track</th>
		<th>Psalm</th>
		<th>Duration</th>
		</tr>
{{#each tracks}}
	{{#if psalm}}
	<tr>
		<td><img class="thumbnail" src="/jpg/{{id}}.jpg"></td>
		<td><a href="#" data-id="{{id}}">{{data.title}}</a></td>
		<td class="center">{{psalm}}</td>
		<td class="center">{{fmtTime data.metadata.duration}}</td>
	</tr>
	{{/if}}
{{/each}}
{{#each tracks}}
	{{#unless psalm}}
	<tr>
		<td><img class="thumbnail" src="/jpg/{{id}}.jpg"></td>
		<td><a href="#" data-id="{{id}}">{{data.title}}</a></td>
		<td class="center">{{psalm}}</td>
		<td class="center">{{fmtTime data.metadata.duration}}</td>
	</tr>
	{{/unless}}
{{/each}}
</table>
`;

	constructor(container, library, player) {
		this.container = container;
		this.library = library;
		this.player = player;
		this.template = Handlebars.compile(TracksView.TEMPLATE);
	}

	update() {
		this.container.innerHTML = this.template({ tracks: this.library.tracks });
		this.container.querySelectorAll('a[data-id]').forEach(a => {
			a.addEventListener('click', (e) => {
				e.preventDefault();
				this.player.play(a.dataset.id);
			});
		});
	}
}

export class Player {
	static TEMPLATE = `
<div id="player">
	<div id="player-info"></div>
	<div id="player-waveform"></div>
	<div id="player-time"></div>
</div>
`;

	constructor(container, library) {
		this.container = container;
		this.library = library;
		this.currentTrack = null;
		this.template = Handlebars.compile(Player.TEMPLATE);
		this.container.innerHTML = this.template({});
		this.infoEl = container.querySelector('#player-info');
		this.timeEl = container.querySelector('#player-time');
		this.wavesurfer = WaveSurfer.create({
			container: container.querySelector('#player-waveform'),
			height: 'auto',
			waveColor: '#8b7a94',
			progressColor: '#5e4b6b',
			cursorColor: 'transparent',
			barWidth: 2,
			barRadius: 3,
			responsive: true,
		});
		this.wavesurfer.on('ready', () => {
			if (this._playOnReady) {
				this._playOnReady = false;
				this.wavesurfer.play();
				if (this._rafId === null) {
					this._rafId = requestAnimationFrame(this._tick);
				}
			}
		});
		this._playOnReady = false;
		this._tick = this._tick.bind(this);
		this._rafId = null;
	}

	play(id) {
		const track = this.library._tracks[id];
		if (!track)
			return;
		this.currentTrack = track;
		this.infoEl.textContent = track.data.title || 'Untitled';
		this.timeEl.textContent = '';
		this._playOnReady = true;
		this.wavesurfer.load('/mp3/' + track.id + '.mp3');
	}

	togglePlay() {
		if (!this.currentTrack)
			return;
		this.wavesurfer.playPause();
	}

	update() {
		if (!this.currentTrack)
			return;
		const elapsed = this.wavesurfer.getCurrentTime();
		const total = this.wavesurfer.getDuration();
		if (isNaN(elapsed) || isNaN(total)) {
			this.timeEl.textContent = '';
			return;
		}
		this.timeEl.textContent = fmtTime(elapsed) + ' / ' + fmtTime(total);
	}

	_tick() {
		this.update();
		if (this.wavesurfer.isPlaying()) {
			this._rafId = requestAnimationFrame(this._tick);
		} else {
			this._rafId = null;
		}
	}
}
