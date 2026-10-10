# Tasajaot – Seminaarinmäen Senators

Tasajaot on sovellus, joka arpoo vuorollemme joukkueet **Valkoinen** ja **Musta** joka viikko. Tämä sivu kertoo, miten arvonta toimii ja miksi joukkueet ovat sellaiset kuin ovat.

Ylläpitäjän ohjeet ovat tiedostossa [KAYTTOONOTTO.md](KAYTTOONOTTO.md).

## Lyhyesti

- Jokaisella pelaajalla on pelipaikka ja rating 1–5.
- Sovellus tekee satoja eri jakoja ja valitsee niistä tasaisimpien joukosta yhden sattumanvaraisesti.
- Tärkeintä on, että **puolustukset ovat yhtä vahvat ja hyökkäykset ovat yhtä vahvat**. Pelkkä yhteissumma ei riitä.
- Joukkueet arvotaan **vain kerran viikossa**. Kukaan ei voi arpoa uudelleen, jos tulos ei miellytä.
- Vuoron jälkeen admin arvioi, oliko jako tasainen. Arvio korjaa ratingeja hieman tulevia viikkoja varten.

## Pelaajan tiedot

| Tieto | Selitys |
|---|---|
| Pelipaikka `P` | Puolustaja |
| Pelipaikka `H` | Hyökkääjä |
| Pelipaikka `PH` | Ensisijainen puolustaja, joka voi pelata myös hyökkääjänä |
| Pelipaikka `HP` | Ensisijainen hyökkääjä, joka voi pelata myös puolustajana |
| Rating 1–5 | Pelaajan taso. Vain adminit näkevät ratingit. |
| Korjausarvo | Arvioista laskettu pieni korjaus ratingiin (katso alempaa). Vain adminit näkevät korjausarvot. |

Maalivahdit eivät ole mukana arvonnassa, koska he vaihtavat päätyä vuoron aikana.

## Joukkueiden koko ja kentät

**Täysi vuoro (20 kenttäpelaajaa):** Kummassakin joukkueessa on 4 puolustajaa ja 6 hyökkääjää. Vuorossa voi olla enintään 20 kenttäpelaajaa, joten joukkueessa on aina enintään 4 puolustajaa ja 6 hyökkääjää.

**Vajaa vuoro:**
- Joukkueissa on yhtä monta pelaajaa. Jos pelaajia on pariton määrä, toinen joukkue saa yhden pelaajan enemmän. Sovellus arpoo, kumpi joukkue.
- Kun pelaajia on 19, puolustajia on 4 + 3, jotta kummassakin joukkueessa on enintään 6 hyökkääjää.
- Kun pelaajia on 14–18, kummassakin joukkueessa on **3 puolustajaa**, ja kaikki muut pelaajat ovat hyökkääjiä. Vajaassa vuorossa sovellus vähentää siis ensin puolustajia ja sitten hyökkääjiä, 1–2 joukkuetta kohti.
- Syy: puolustajamme ovat yleensä hyvässä kunnossa ja kovia luistelijoita. Siksi kolme puolustajaa riittää.
- Jos pelaajia on alle 14, noin 40 % pelaajista pelaa puolustajina.

| Pelaajia | Joukkueet | Puolustajia | Hyökkääjiä |
|---|---|---|---|
| 20 | 10 + 10 | 4 + 4 | 6 + 6 |
| 19 | 10 + 9 | 4 + 3 | 6 + 6 |
| 18 | 9 + 9 | 3 + 3 | 6 + 6 |
| 17 | 9 + 8 | 3 + 3 | 6 + 5 |
| 16 | 8 + 8 | 3 + 3 | 5 + 5 |
| 15 | 8 + 7 | 3 + 3 | 5 + 4 |
| 14 | 7 + 7 | 3 + 3 | 4 + 4 |

**Puhtaat pelipaikat menevät sääntöjen edelle:** P-pelaaja pelaa aina puolustajana, ja H-pelaaja pelaa aina hyökkääjänä. Jos esimerkiksi 18 pelaajan vuorossa on 7 P-pelaajaa, puolustajia on 7, ja toisessa joukkueessa on 4 puolustajaa.

**Kaksi pelipaikkaa (PH ja HP):** Pelaaja pelaa ensin ensisijaisella paikallaan. Jos puolustajia tai hyökkääjiä puuttuu, sovellus siirtää PH- tai HP-pelaajan toiselle paikalle. Sovellus siirtää vain niin monta pelaajaa kuin on pakko.

## Miten sovellus valitsee tasaiset joukkueet

Sovellus vertaa jokaisessa jaossa näitä asioita tässä järjestyksessä:

1. **Vahvat ja heikot pelaajat:** pelaajat, joiden rating on vähintään 4,5, ja pelaajat, joiden rating on alle 2. Kummassakin joukkueessa on yhtä monta vahvaa ja yhtä monta heikkoa pelaajaa. Jos määrä on pariton, ero on yksi pelaaja.
2. **Puolustusten taso:** puolustajien vaikutusarvojen keskiarvo kummassakin joukkueessa.
3. **Hyökkäysten taso:** hyökkääjien vaikutusarvojen keskiarvo kummassakin joukkueessa.
4. **Joukkueiden kokonaistaso:** kaikkien pelaajien vaikutusarvojen summa.
5. **Pelipaikat:** mahdollisimman moni pelaaja pelaa ensisijaisella paikallaan.

Kentät ovat tärkeämmät kuin kokonaistaso, jotta vahva puolustus ei voi korvata heikkoa hyökkäystä. Kun kentät ovat tasaiset, myös kokonaistaso on tasainen.

Sovellus vertaa kenttien keskiarvoja, ei summia. Jos joukkueessa on 3 puolustajaa ja toisessa 4, summien vertailu antaisi väärän tuloksen.

### Vahvat ja heikot pelaajat

Ratingin ääripäiden pelaajat vaikuttavat joukkueen tasoon enemmän kuin rating kertoo. Pelaaja, jonka rating on 4,5–5, ratkaisee pelejä. Pelaaja, jonka rating on alle 2, heikentää joukkueen peliä selvästi. Pelaajat, joiden rating on lähellä keskiarvoa 3, eivät vaikuta yhtä paljon.

Siksi sovellus ei vertaa ratingeja suoraan. Se muuttaa jokaisen ratingin **vaikutusarvoksi**:

- e = rating − 3
- vaikutusarvo = 3 + e × (1 + k × |e|)
- k on 0,5, kun rating on yli 3, ja 0,3, kun rating on alle 3.

Vahvan pelaajan kerroin on suurempi, koska vahva pelaaja ratkaisee peliä enemmän kuin heikko pelaaja heikentää sitä.

| Rating | Vaikutusarvo | Muutos |
|---|---|---|
| 5,0 | 7,0 | +2,0 |
| 4,5 | 5,6 | +1,1 |
| 4,0 | 4,5 | +0,5 |
| 3,5 | 3,6 | +0,1 |
| 3,0 | 3,0 | 0 |
| 2,5 | 2,4 | −0,1 |
| 2,0 | 1,7 | −0,3 |
| 1,5 | 0,8 | −0,7 |
| 1,0 | −0,2 | −1,2 |

**Esimerkkejä kolmen pelaajan ketjuista.** Ratingien summat ovat samat, mutta vaikutusarvot eivät ole:

| Ketju 1 | Ketju 2 | Vaikutusarvot | Vahvempi ketju |
|---|---|---|---|
| 5, 1 | 3, 3 | 6,8 – 6,0 | Ketju 1: viitonen ratkaisee enemmän kuin ykkönen heikentää. |
| 5, 2, 2 | 3, 3, 3 | 10,4 – 9,0 | Ketju 1 |
| 4, 4, 1 | 3, 3, 3 | 8,8 – 9,0 | Ketju 2: ykkösen haitta on suurempi kuin kahden nelosen etu. |
| 3,5, 2,5 | 3, 3 | 6,0 – 6,0 | Tasan: keskialueella mikään ei muutu. |

### Arvonnan vaiheet

1. Sovellus jakaa pelaajat joukkueisiin satunnaisesti, mutta oikeilla määrillä (esimerkiksi 4 + 6 ja 4 + 6).
2. Sovellus vaihtaa kahden pelaajan paikkaa, jos vaihto tekee joukkueista tasaisemmat. Se jatkaa, kunnes mikään vaihto ei enää auta.
3. Sovellus toistaa vaiheet 1 ja 2 noin 300 kertaa. Näin se löytää paljon eri jakoja.
4. Sovellus valitsee kaikista jaoista tasaisimmat. Niistä se arpoo yhden.
5. Sovellus arpoo, kumpi joukkue on Valkoinen ja kumpi Musta.

Vaihe 4 on syy, miksi joukkueet vaihtuvat joka viikko. Tasaisia jakoja on yleensä kymmeniä, ja kaikki ovat yhtä hyviä. Jos sovellus valitsisi aina saman jaon, samat pelaajat olisivat joka viikko samassa joukkueessa.

### Kuinka tasaisia joukkueet ovat?

Testasimme algoritmia 200 kuvitteellisella vuorolla, joissa on 20 pelaajaa ja satunnaiset ratingit 1–5. Puolustusten ratingien summa erosi keskimäärin 0,4 pistettä ja hyökkäysten 0,3 pistettä. Ero on koko kentän summa, ei ero pelaajaa kohti.

Vahvat ja heikot pelaajat jakautuivat tasan jokaisessa testivuorossa. Ilman tätä sääntöä noin joka neljännessä vuorossa toisessa joukkueessa oli kaksi vahvaa tai heikkoa pelaajaa enemmän.

Täysin tasaisia jakoja ei aina ole. Jos vuorossa on esimerkiksi yksi selvästi muita parempi puolustaja, toinen puolustus on aina hieman vahvempi.

## Arvonta vain kerran

Admin valitsee viikon pelaajat ja arpoo joukkueet. Tietokanta sallii vain yhden arvonnan jokaista viikkoa kohti. Kun joukkueet on arvottu, kukaan ei voi muuttaa niitä sovelluksessa. Admin ei siis voi arpoa uudelleen, jos hän ei pidä tuloksesta.

Admin näkee arvonnan tuloksen vasta, kun se on tallennettu.

**Testiarvonta:** Adminit voivat kokeilla arvontaa testiarvonnalla. Sovellus ei tallenna testiarvontaa, eikä kukaan muu näe sitä. Testiarvonnan kuvassa lukee ”TESTI – EI TALLENNETTU”. Vain tallennettu arvonta on voimassa.

## Arvio vuoron jälkeen ja korjausarvo

Rating on ihmisen arvio, eikä se ole aina oikea. Siksi admin arvioi vuoron jälkeen, olivatko joukkueet tasaiset:

| Arvio | Vaikutus Valkoisen pelaajiin | Vaikutus Mustan pelaajiin |
|---|---|---|
| Valkoinen selvästi parempi | +0,10 | −0,10 |
| Valkoinen hieman parempi | +0,05 | −0,05 |
| Tasainen | 0 | 0 |
| Musta hieman parempi | −0,05 | +0,05 |
| Musta selvästi parempi | −0,10 | +0,10 |

Admin voi kirjata myös lopputuloksen. Lopputulos ei muuta korjausarvoja. Se on vain tilastoa varten.

Vain adminit näkevät arviot ja lopputulokset.

Arvonta käyttää lukua **rating + korjausarvo**. Jos joukkue oli parempi kuin ratingit kertoivat, sen pelaajat olivat todennäköisesti hieman ratingiaan parempia. Siksi heidän korjausarvonsa nousee. Toisen joukkueen pelaajien korjausarvo laskee saman verran.

**Esimerkki:** Matin rating on 3. Matti on kolmena viikkona joukkueessa, joka on "selvästi parempi". Matin korjausarvo on silloin +0,30, ja arvonta käyttää Matille lukua 3,3. Jos seuraavalla viikolla Matin joukkue häviää selvästi, korjausarvo laskee lukuun +0,20.

**Rajat:**
- Yksi vuoro muuttaa korjausarvoa enintään 0,10.
- Korjausarvo on aina välillä −1 ja +1.
- Jokaisen vuoron voi arvioida vain kerran.
- Admin voi nollata pelaajan korjausarvon, esimerkiksi silloin kun hän muuttaa ratingia käsin.

**Miksi muutokset ovat pieniä?** Yksi peli kertoo vähän. Tulokseen vaikuttavat esimerkiksi maalivahdit, väsymys ja sattuma. Yksittäinen ilta ei siksi saa muuttaa ratingeja paljon. Korjausarvot alkavat kertoa jotain luotettavaa vasta noin 10–20 vuoron jälkeen. Silloin sama pelaaja on ollut monta kertaa eri pelaajien kanssa samassa joukkueessa.

## Kuka näkee mitä

| Tieto | Kaikki | Adminit |
|---|---|---|
| Arvotut joukkueet | ✓ | ✓ |
| Arvio ja lopputulos | | ✓ |
| Pelaajien ratingit | | ✓ |
| Pelaajien korjausarvot | | ✓ |
| Joukkueiden ratingien summat | | ✓ |

Sovelluksen lähdekoodi on avointa, joten kuka tahansa voi tarkistaa arvonnan logiikan. Algoritmi on tiedostossa [`js/draw.js`](js/draw.js), ja arvion laskenta on tiedostossa [`supabase/schema.sql`](supabase/schema.sql) (funktio `evaluate_draw`).
