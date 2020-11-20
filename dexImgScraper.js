const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');


const BULBAPEDIA_URL = 'https://bulbapedia.bulbagarden.net';
const IMG_ARCHIVE_URL = 'https://archives.bulbagarden.net/wiki/Category:';

async function get(url) {
	return await axios.get(url);
}

function getAsBuffer(url) {
	// return https.get(url, function(res) {
	// 	const data = [];
		
	// 	res.on('data', (chunk) => {
	// 		data.push(chunk);
	// 	}).on('end', () => {
	// 		return Buffer.concat(data);
	// 	});
	// });
	return axios.get(url, { responseType: 'arraybuffer' })
		.then(response => Buffer.from(response.data, 'binary'))
		.catch(error => logFetchError(url, error.message));
}

async function getPokemonSprite($el) {
	let spriteUrl = $el.find('img').attr('src');
	if(spriteUrl.startsWith('/')) {
		spriteUrl = `https:${spriteUrl}`;
	}
	const urlTokens = spriteUrl.split('/'),
		fileName = urlTokens[urlTokens.length - 1];
	const imgBuffer = await getAsBuffer(spriteUrl);
	fs.writeFile(`sprites/${fileName}`, imgBuffer, () => {});
	// sharp(imgBuffer)
	// 	// .resize(40, 40)
	// 	.toFile(`sprites/${fileName}`)
}

async function getPokemonImages(url, num) {
	let pkmnImage = '';
	const pkmnPage = await get(`${BULBAPEDIA_URL}${url}`);
	const $ = cheerio.load(pkmnPage.data);
	
	const img = $('#mw-content-text table').first().find('.image').first().find('img');
	if(img.attr('srcset')) {		
		const pkmnImageSrcSet = $('#mw-content-text table.roundy').first().find('.image').first().find('img').attr('srcset').split(',');
		let largestScale = 0;
		pkmnImageSrcSet.forEach((itm) => {
			const arr = itm.match(/(.+) ([\d\.]+)x/);
			if(arr && arr.length && parseFloat(arr[2]) > largestScale) {
				pkmnImage = arr[1].trim();
				largestScale = parseFloat(arr[2])
			}
		});
	} else if(img.attr('src')) {
		pkmnImage = img.attr('src');
	}
	if(pkmnImage.startsWith('/')) {
		pkmnImage = `https:${pkmnImage}`;
	}
	const imgBuffer = await getAsBuffer(pkmnImage);
	
	sharp(imgBuffer)
		.resize(400, 400)
		.toFile(`images/${num}.png`)
	sharp(imgBuffer)
		.resize(100, 100)
		.toFile(`thumbnails/${num}.png`);
}

async function loadGalleryImg($el, type, pkmnName, fileNum) {
	if($el.length) {
		let pkmnImage = '';
		const img = $el.closest('.gallerybox').find('img');
		if(img.attr('srcset')) {		
			const pkmnImageSrcSet = img.attr('srcset').split(',');
			let largestScale = 0;
			pkmnImageSrcSet.forEach((itm) => {
				const arr = itm.match(/(.+) ([\d\.]+)x/);
				if(arr && arr.length && parseFloat(arr[2]) > largestScale) {
					pkmnImage = arr[1].trim();
					largestScale = parseFloat(arr[2])
				}
			});
		} else if(img.attr('src')) {
			pkmnImage = img.attr('src');
		}
		if(pkmnImage.startsWith('/')) {
			pkmnImage = `https:${pkmnImage}`;
		}
		
		const imgBuffer = await getAsBuffer(pkmnImage);
		if(type === 'sprite') {
			fs.writeFile(`sprites/${fileNum}MS.png`, imgBuffer, () => {});
		} else {
			sharp(imgBuffer)
				.resize(400, 400)
				.toFile(`images/${fileNum}.png`)
			sharp(imgBuffer)
				.resize(100, 100)
				.toFile(`thumbnails/${fileNum}.png`);
		}
	} else {
		logFetchError(pkmnName, `Could not find ${type} URL. Check manually or skip.`);
	}
}

async function getSpriteAndImagesFromGallery(pkmnName, dexNum, suffix, fileNum) {
	const archivePage = await get(`${IMG_ARCHIVE_URL}${pkmnName.replace(' ', '_')}`);
	const $ = cheerio.load(archivePage.data);
	
	const pkmnSpriteName = `${dexNum.toString().padStart(3, '0')}${suffix.charAt(0)}MS.png`;
	const pkmnImgName = `${dexNum.toString().padStart(3, '0')}${pkmnName}-${suffix}.png`;
	
	const spriteLink = $(`.galleryfilename:contains(${pkmnSpriteName})`);
	const imgLink = $(`.galleryfilename:contains(${pkmnImgName})`);
	
	loadGalleryImg(spriteLink, 'sprite', pkmnName, fileNum);
	loadGalleryImg(imgLink, 'image', pkmnName, fileNum);
}

async function get8thGenMons() {
	const list = await get(BULBAPEDIA_URL + '/wiki/List_of_Pok%C3%A9mon_by_index_number_(Generation_VIII)');
	const $ = cheerio.load(list.data);
	$('#mw-content-text table.roundy tr').each((i, row) => {
		const $cells = $(row).find('td');
		if(!$cells.length) {
			return;
		}
		const $numberCell = $($cells[1]),
			$spriteCell = $($cells[2]),
			$linkCell = $($cells[3]);
		if(parseInt($numberCell.text()) < 810) {
			// console.log('skipping row ' + $numberCell.text());
			return;
		}
		getPokemonSprite($spriteCell);
		getPokemonImages($linkCell.find('a').attr('href'), parseInt($numberCell.text()));
	});
}

// get8thGenMons();
// getPokemonImages('/wiki/Ten_question_marks', 896);
// getPokemonImages('/wiki/Ten_question_marks', 897);

// getPokemonImages('/wiki/Regidrago_(Pokémon)', 895);
// getPokemonImages('/wiki/Calyrex_(Pokémon)', 898);

function logFetchError(name, reason) {
	console.log(`Failed to fetch ${name}. Reason: ${reason}`)
}

function getAltFormMons() {
	const file = JSON.parse(fs.readFileSync('pokedex.json'));
	const altForms = file.filter((pkmn) => pkmn.id > 9000);
	
	altForms.forEach(async (pkmn) => {
		const nameTokens = pkmn.name.split(' ');
		const region = nameTokens[0].match(/(Alola|Galar)/)[1];
		const nameFormatted = nameTokens.splice(1).join(' ');
		const dexNum = file.filter((pkmn) => pkmn.name === nameFormatted)[0].id;
		if(!region) {
			logFetchError(pkmn.name, `No region data found - read ${nameTokens[0]}`);
		} else if(!nameFormatted) {
			logFetchError(pkmn.name, `Couldn't format name`);
		} else if(!dexNum) {
			logFetchError(pkmn.name, `Couldn't get base form`);	
		} else {
			await getSpriteAndImagesFromGallery(nameFormatted, dexNum, region, pkmn.id);
		}
	});
}

getAltFormMons();