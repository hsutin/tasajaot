# Tasajaot: ylläpitäjän ohjeet

Tämä ohje on ylläpitäjille. Arvonnan logiikan selitys pelaajille on tiedostossa [README.md](README.md).

- Sivu on staattinen. GitHub Pages näyttää sen.
- Supabase (ilmainen) tallentaa pelaajat ja arvonnat ja hoitaa kirjautumisen.
- Vain adminit näkevät pelaajat ja ratingit. Kaikki näkevät arvotut joukkueet.
- Yhdelle viikolle voi arpoa joukkueet vain kerran. Tietokanta estää toisen arvonnan.

## Käyttöönotto

### 1. Tee Supabase-projekti

1. Kirjaudu osoitteessa <https://supabase.com> ja tee uusi projekti (Free-taso riittää).
2. Avaa **SQL Editor**, liitä tiedoston `supabase/schema.sql` sisältö ja valitse **Run**.
3. Avaa **Authentication > Sign In / Providers**. Poista **Allow new users to sign up** käytöstä, jotta vieraat eivät voi tehdä tunnuksia.
4. Avaa **Authentication > Users > Add user > Create new user**. Tee tunnus jokaiselle adminille (sähköposti ja salasana). Valitse **Auto Confirm User**.
5. Lisää adminit tauluun `admins`. Avaa **SQL Editor** ja aja:

   ```sql
   insert into public.admins ( user_id )
   select id from auth.users where email in ( 'admin1@example.com', 'admin2@example.com' );
   ```

6. Avaa **Project Settings > API** (tai **API Keys**). Kopioi **Project URL** ja **anon**- tai **publishable**-avain.

### 2. Lisää asetukset

Kirjoita arvot tiedostoon `js/config.js`:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOi...';
```

Voit tallentaa nämä arvot julkiseen repoon. Tietokannan säännöt (RLS) suojaavat datan.

> **Varoitus:** Älä koskaan laita `service_role`- tai `secret`-avainta tähän tiedostoon. Sillä avaimella kuka tahansa voi lukea ja muuttaa kaiken datan.

### 3. Julkaise GitHub Pagesissa

1. Tee GitHubiin uusi repo (esimerkiksi `tasajaot`) ja lähetä tämän kansion tiedostot sinne.
2. Avaa repossa **Settings > Pages**.
3. Valitse **Source: Deploy from a branch**, haara `main` ja kansio `/ (root)`.
4. Sivu on hetken kuluttua osoitteessa `https://<käyttäjä>.github.io/tasajaot/`.
5. Lisää tämä osoite Supabaseen: **Authentication > URL Configuration > Site URL**.

### 4. Tuo pelaajat

1. Kirjaudu sivulla admin-tunnuksella.
2. Avaa välilehti **Pelaajat** ja valitse Excel-tiedosto.

Excel-tiedoston ensimmäisellä välilehdellä pitää olla nämä sarakkeet (otsikkorivi ensimmäisellä rivillä):

| nimi | pelipaikka | rating |
|---|---|---|
| Matti Meikäläinen | P | 4 |
| Teemu Teikäläinen | HP | 3,5 |

Sovellus päivittää pelaajat, joilla on sama nimi, ja lisää uudet pelaajat. Se ei poista pelaajia, jotka puuttuvat tiedostosta.

## Viikoittainen käyttö

1. Kirjaudu sisään.
2. Valitse välilehdellä **Arvonta** vuoron päivä.
3. Valitse viikon pelaajat listalta. Sovellus muistaa edellisen valinnan tässä selaimessa.
4. Valitse **Arvo joukkueet** ja hyväksy vahvistus.
5. Valitse **Jaa kuva (WhatsApp)**. Puhelimessa jakovalikko avautuu, ja voit valita WhatsApp-ryhmän. Tietokoneella sovellus lataa PNG-kuvan.

Vuoron jälkeen:

1. Avaa sivu ja valitse oikea viikko.
2. Valitse lomakkeesta **Arvioi vuoro**, oliko jako tasainen. Kirjoita myös lopputulos, jos haluat.
3. Valitse **Tallenna arvio**. Vuoron voi arvioida vain kerran.

Pelaajien korjausarvot näkyvät välilehdellä **Pelaajat**, sarakkeessa **Korjaus**. Painike **Nollaa** palauttaa korjausarvon nollaan. Nollaa korjausarvo esimerkiksi silloin, kun muutat pelaajan ratingia käsin.

Jos arvonta on pakko tehdä uudelleen (esimerkiksi väärä päivä), poista rivi Supabasessa: **Table Editor > draws**. Sovellus ei voi poistaa arvontoja.

## Tietokannan päivitys

Kun sovellukseen tulee uusia ominaisuuksia, myös tietokanta voi muuttua. Aja silloin tiedosto `supabase/schema.sql` uudelleen Supabasen SQL Editorissa. Tiedoston voi ajaa monta kertaa. Se lisää vain puuttuvat osat, eikä se poista dataa.

> **Huom:** Arvio-ominaisuus vaatii tämän päivityksen. Jos ajoit `schema.sql`:n ennen arvio-ominaisuutta, aja se uudelleen. Arviot ovat taulussa `draw_evaluations`, ja vain adminit voivat lukea sen.

## Kehitys

Sivu ei tarvitse käännöstä. Käynnistä paikallinen palvelin projektin kansiossa:

```sh
python3 -m http.server 8000
```

Avaa sitten <http://localhost:8000>.

Aja arvonta-algoritmin testit (Node 20 tai uudempi):

```sh
npm test
```

## Tiedostot

| Tiedosto | Sisältö |
|---|---|
| `README.md` | Arvonnan logiikka pelaajille |
| `KAYTTOONOTTO.md` | Tämä ohje |
| `index.html` | Sivun rakenne |
| `assets/logo.png` | Joukkueen logo |
| `css/style.css` | Tyylit |
| `js/app.js` | Käyttöliittymä ja Supabase-kutsut |
| `js/draw.js` | Arvonta-algoritmi |
| `js/image.js` | WhatsApp-kuvan teko ja jako |
| `js/excel.js` | Excel-tuonti |
| `js/config.js` | Supabase-asetukset |
| `supabase/schema.sql` | Tietokannan taulut ja oikeudet |
| `tests/draw.test.mjs` | Algoritmin testit |
