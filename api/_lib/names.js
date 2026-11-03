'use strict';
/* names.js — ad soyad doğrulaması (tek kaynak: sunucu). İstemci yalnızca hata nedenine göre mesaj gösterir.
   Kurallar:
     • yalnızca Türk alfabesi (q / w / x yok), 2–4 sözcük, her sözcük 2–24 harf
     • ilk ad Türkçe isim listesinde olmalı (yazım kanonik biçime çevrilir: "ayse" → "Ayşe", "SARP" → "Sarp")
     • küfür / hakaret yok (harf katlama, rakam / simge ikameleri, ayrık yazım yakalanır)
     • anlamsız yazı yok (sesli harfsiz sözcük, 4+ ünsüz, aynı harf 3 kez, "asdasd", klavye dizileri, yabancı harf öbekleri)
     • yer tutucu yok ("test", "deneme", "isim soyisim", "kral" …)
   Liste genişletilebilir: GIVEN dizgesine boşlukla ayrılmış yeni ad eklemek yeterlidir. */

/* ---------------- Türkçe yazım yardımcıları ---------------- */
const lowerTR = (s) => String(s).toLocaleLowerCase('tr-TR');
const upperTR = (s) => String(s).toLocaleUpperCase('tr-TR');
const titleTR = (w) => w.split('-').map((p) => (p ? upperTR(p[0]) + lowerTR(p.slice(1)) : p)).join('-');
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const fold = (s) => lowerTR(s).replace(/[çğıöşüâîû]/g, (c) => FOLD[c]);
const collapse = (s) => s.replace(/(.)\1+/g, '$1');

/* ---------------- Türkçe adlar (erkek, kadın, unisex; Türkiye'de yaygın Kürtçe, Arapça kökenli ve azınlık adları dahil) ---------------- */
const GIVEN = `
Abbas Abdi Abdullah Abdulkadir Abdülkadir Abdurrahman Abdülhamit Abdulhamit Abdülkerim Abdülvahap Abdülsamet Abdussamet Abidin Abuzer Acar Ada Adalet Adem Adil Adile Adnan Afet Afife Afitap Afra Afşin Ağah Ahenk Ahmet Ahmed Ahsen Ahu Akan Akasya Akay Akça Akçay Akgün Akif Akile Akın Aksel Aksu Akyüz Alaaddin Alaattin Alaz Alev Ali Alican Alihan Alim Alime Alişan Alkım Almila Alp Alparslan Alpaslan Alpay Alper Alperen Alphan Alptekin Altan Altay Altın Altuğ Alya Amine Anıl Aral Aram Aras Arat Arca Arda Ardahan Arel Arhan Arif Arife Arın Arya Arzu Artun Arslan Asaf Asel Asena Asil Asım Asiye Aslan Aslı Aslıhan Asude Asuman Asya Aşkın Aşır Ata Atahan Atakan Atalay Atay Ateş Atıf Atıl Atila Atilla Atlas Ayaz Aybars Ayben Ayberk Aybike Aybüke Ayca Ayça Aycan Aydan Aydemir Aydil Aydın Ayfer Aygen Aygül Aygün Ayhan Aykan Aykut Ayla Aylin Ayliz Aynur Aysan Aysel Aysima Aysu Aysun Ayşan Ayşe Ayşegül Ayşen Ayşenur Ayşın Aytaç Aytekin Ayten Aytuğ Aytül Azad Azade Azat Azim Azime Aziz Azize Azra
Bade Bahadır Bahar Bahattin Bahri Bahriye Baki Balkan Banu Baran Barbaros Barış Barkan Barkın Barlas Bartu Basri Başak Batıkan Batın Battal Batu Batuhan Baturalp Bayhan Bayram Bedia Bedirhan Bedri Bedriye Begüm Behçet Behice Behiye Behlül Behzat Bekir Belgin Belinay Belkıs Belma Benan Bengi Bengisu Bengü Bennur Berat Berfin Berivan Berk Berkan Berkay Berke Berker Berkin Berna Beril Berra Berrak Berrin Besim Besime Beste Betül Beyhan Beytullah Beyza Bihter Bilal Bilge Bilgehan Bilgen Bilgin Billur Binnaz Bircan Birce Birgül Birgün Birhan Birol Birsen Birtan Bora Boran Buğra Buğrahan Buket Bulut Burak Burcu Burçak Burçin Burhan Burhanettin Büge Bülent Bünyamin Büşra
Cafer Can Canan Canay Canberk Candan Caner Cankat Cansel Cansın Cansu Cavit Celal Celalettin Celil Cem Cemal Cemalettin Cemil Cemile Cemre Cengiz Cenk Cennet Ceren Cevat Cevdet Cevriye Ceyda Ceyhun Ceylan Ceylin Cezmi Cihan Cihangir Civan Coşkun Cuma Cumali Cüneyt
Çağan Çağatay Çağdaş Çağıl Çağla Çağlar Çağlayan Çağrı Çelebi Çetin Çiçek Çiğdem Çiler Çınar Çisem Çisil
Davut Davud Defne Delal Demet Demir Demirhan Deniz Deren Derin Derya Destan Dicle Didem Dila Dilan Dilara Dilay Dilber Dildar Dilek Dilnaz Dilovan Dilşad Dilşat Dinç Diyar Doğa Doğan Doğukan Doğuş Doruk Dudu Duran Durdu Durmuş Dursun Duru Duygu Dündar Düriye
Ebrar Ebru Ebubekir Ece Ecem Ecrin Eda Edanur Edibe Edip Efe Efecan Eflin Efsun Ege Egehan Egemen Ekin Ekrem Ela Elanur Elçin Elif Elifnur Eliz Elmas Elvan Elvin Emek Emel Emin Emine Emir Emircan Emirhan Emrah Emre Emrullah Ender Engin Enes Enis Ensar Eray Erbil Ercan Ercüment Erdal Erdem Erdi Erdinç Erdoğan Eren Ergin Ergun Ergün Erhan Erinç Erk Erkan Erkin Erkut Erman Erol Ersan Ersel Ersin Ersoy Ertan Ertekin Ertuğrul Ertunç Erva Esat Esen Esengül Esila Esin Eslem Esma Esmanur Esra Esranur Eser Eşref Ethem Evin Evren Evrim Eylül Eymen Eyüp Ezel Ezgi
Fadime Fadıl Fahrettin Fahri Fahriye Faik Fatih Fatma Fatmanur Fatoş Fazıl Fazilet Fehmi Ferda Ferdi Feride Feridun Ferhan Ferhat Feriha Ferit Fethi Fevzi Fevziye Feyyaz Feyza Feyzullah Fidan Figen Fikret Fikri Fikriye Filiz Firdevs Fırat Fuat Fulya Funda Furkan Fügen Füsun
Galip Garip Gaye Gizem Gökalp Gökay Gökberk Gökçe Gökçen Gökhan Gökmen Göknur Göksel Göktuğ Göktürk Gönül Gözde Gül Gülay Gülbahar Gülben Gülcan Gülçin Güldane Güler Gülfem Gülhan Gülizar Gülnaz Gülnur Gülru Gülsen Gülseren Gülsüm Gülsün Gülşah Gülşen Gülten Günay Gündüz Güneş Güngör Güray Gürkan Gürol Gürsel Güven Güzide Güzin
Habib Hacer Hacı Hadi Hafize Hakan Hakkı Haktan Halil Halim Halime Halis Halit Haluk Hamdi Hamide Hamit Hamid Hamiyet Hamza Handan Hande Hanife Harun Hasan Hasibe Hasret Hatice Hatun Havva Haydar Hayal Hayati Hayrettin Hayri Hayriye Hazal Hediye Hejar Helin Hicran Hikmet Hilal Hilmi Hira Hiranur Hıdır Hulusi Huriye Hülya Hümeyra Hüsamettin Hüseyin Hüsnü Hüsniye
Irmak Işık Işıl Işın Ilgaz Ilgın
İbrahim İclal İdil İdris İhsan İkbal İkra İlayda İlhami İlhan İlkay İlke İlker İlkin İlknur İlter İlyas İmren İnan İnci İpek İrem İrfan İsa İshak İskender İsmail İsmet İsmihan İsra İzzet
Jale Jiyan Jülide
Kaan Kader Kadir Kadriye Kamil Kamile Kamuran Kani Kaplan Kardelen Kartal Kayahan Kayhan Kayra Kazım Kemal Kemalettin Kenan Kerem Kerim Kerime Kevser Kezban Kıvanç Kıvılcım Kıymet Kiraz Koray Korhan Korkmaz Köksal Kubilay Kudret Kumru Kumsal Kurtuluş Kutay Kutlay Kutlu Kuzey Kübra
Lal Lale Lara Latife Leman Lemi Levent Leyla Lina Lokman Lütfi Lütfiye
Mahinur Mahir Mahmut Mahmud Mahsun Makbule Mansur Masal Mazhar Medine Mediha Medya Mehdi Mehlika Mehmet Mehmetcan Mehpare Mehtap Mehveş Melahat Melda Melek Melih Melike Meliha Melis Melisa Meltem Menderes Menekşe Meral Merve Meryem Mert Mertcan Mesude Mesut Mete Metehan Metin Meva Mevlüt Mila Mina Mine Mira Miraç Miray Mithat Mizgin Mısra Muammer Muazzez Muhammed Muhammet Muharrem Muhittin Muhlis Muhsin Muhterem Mukadder Mukaddes Mualla Murat Musa Mustafa Mutlu Muzaffer Müberra Mücahit Mücella Müfide Müge Müjdat Müjde Müjgan Mükerrem Mümtaz Münevver Münir Münire Mürvet Mürüvvet Müslüm Müşerref Müzeyyen
Naci Nadide Nadir Nadire Nafiz Nail Naile Nalan Namık Nazan Nazife Nazım Nazlı Nazmi Nebahat Necati Necdet Necip Necla Necmettin Necmi Nedim Nedret Nefise Nehir Nermin Neriman Nesibe Neslihan Nesrin Neşe Neşet Nevin Nevra Nevzat Nezahat Nezaket Nezih Nezihe Nida Nihal Nihan Nihat Nil Nilay Nilgün Nilüfer Nimet Nisa Nisan Nisanur Nur Nuran Nuray Nurcan Nurdan Nurettin Nurgül Nurhan Nurhayat Nuri Nuriye Nurseli Nurşah Nurşen Nurten Nusret Nükhet Nüzhet
Ogün Oğulcan Oğuz Oğuzhan Okan Okay Oktay Olcay Olgun Onat Onur Onuralp Orçun Orhan Orhun Orkun Osman Oya Oytun Ozan
Ömer Ömercan Ömür Önder Öner Övünç Öykü Özay Özcan Özden Özdemir Özen Özer Özge Özgen Özgün Özgür Özkan Özlem Öznur
Pakize Pamir Pelin Pembe Peri Perihan Pervin Pınar Polat Poyraz
Rabia Rahime Rahmi Ramazan Rana Rasim Rauf Raziye Recep Refik Refika Reha Remzi Rengin Reşat Reşit Reyhan Rezan Rıdvan Rıfat Rıza Rojan Rojbin Rojda Rojhat Rojin Ronahi Ruhi Rukiye Rumeysa Ruşen Rüştü Rümeysa Rüveyda Rüya Rüzgar Rüzgâr
Saadet Sabahattin Sabire Sabri Sabriye Sacide Sadettin Sadi Sadık Sadullah Saffet Safiye Saim Sait Sakine Salih Saliha Samet Sami Sanem Saniye Sare Sarkis Sarp Sarper Savaş Seçil Seçkin Seda Sedanur Sedat Sedef Sefa Sefer Seher Selahattin Selami Selcan Selçuk Selda Selen Selim Selime Selin Selma Selvi Sema Semanur Semih Semiha Semra Sena Senai Senem Seniha Serap Serdal Serdar Seren Serenay Serhan Serhat Serkan Sermin Serpil Serra Sertaç Sertan Server Sevcan Sevda Sevde Sevgi Sevgül Sevil Sevilay Sevim Sevinç Sevtap Seyda Seyfi Seyfullah Seyhan Seyit Seyithan Seyran Sezai Sezen Sezer Sezgi Sezgin Sezin Sıdıka Sıla Sırma Sırrı Sibel Simay Simge Sinan Sinem Songül Soner Su Suat Sude Sudenur Sultan Sumru Suna Sunay Sungur Suzan Süha Süheyla Süleyman Sümer Sümeyye Süreyya
Şaban Şadiye Şafak Şahan Şahika Şahin Şakir Şamil Şebnem Şefika Şehmus Şenay Şener Şengül Şenol Şerafettin Şeref Şerife Şermin Şevket Şevval Şeyda Şeyhmus Şeyma Şilan Şimşek Şirin Şiyar Şükran Şükriye Şükrü Şule
Taha Tahir Tahsin Talat Talha Tamer Taner Tanju Tansel Tansu Tanzer Tarık Tarkan Tayfun Tayfur Taylan Tayyibe Tayyip Tekin Teoman Tevfik Tezcan Tijen Timur Tolga Tolgahan Toprak Toygar Tuba Tuğba Tuğberk Tuğçe Tuğrul Tuna Tunahan Tunç Tunca Tuncay Turan Turgay Turgut Turhan Turna Tülay Tülin Tümay Türkan Tüzün
Ufuk Uğur Uğurcan Ulaş Ulvi Ulviye Umay Umut Ural Utku Uzay
Ülker Ülkü Ümit Ümmü Ümmühan Ümmügülsüm Ümran Ünal Ünsal Ünzile Üstün Üzeyir
Vahap Vahdet Vahit Vasfi Vasıf Vecdi Vecihe Vedat Vehbi Velat Veli Vesile Veysel Vildan Volkan Vural
Yağız Yağmur Yahya Yakup Yakub Yalçın Yalın Yaman Yankı Yaprak Yaren Yasemin Yasin Yaşar Yavuz Yazgı Yekta Yelda Yeliz Yener Yeşim Yeter Yetkin Yıldırım Yıldız Yılmaz Yiğit Yiğitcan Yonca Yunus Yurdagül Yurdakul Yusuf Yücel Yüksel Yüsra
Zafer Zahide Zahit Zarife Zehra Zekai Zekeriya Zeki Zekiye Zelal Zeliha Zeren Zerrin Zeynel Zeynep Zilan Zinnur Ziya Ziynet Zişan Zozan Zuhal Zübeyde Zübeyir Zühal Zühre Zülal Zülfiye Zümra Zümrüt
Abdulaziz Abdülaziz Abdulbaki Abdülbaki Abdullatif Abdülmecit Abdulmecit Abdurrahim Abdürrahim Abdurrezzak Abdülkerim Agop Alara Alkan Almina Arjin Arto Asmin Asrın Avesta Avram Aren
Bahaddin Bahaettin Bars Berçem Beren Berzan Botan Buse
Celaleddin Cihat
Damla Dara Davit Derviş Diljin Dimitri Durak
Efehan Eleni Enver Erkam
Fahreddin Faruk Feraye Ferah Feyzi Firuze Fehime
Gamze Gani Garo Gazi Gonca Gülbeyaz Güldeniz Gülderen Gülendam Gülfidan Gülistan Gülnihal Gülpembe Gülümser
Hafsa Hagop Hale Hamdullah Hanzade Hayat Hayreddin Hayrullah Hayrünnisa Hazan Hevin Hidayet Hikmetullah Hilmiye Hozan Hrant Huri Hürrem Hüsne
İffet İlkim İzzeddin İzzettin
Kadife Kağan Kamer Kaya Kemaleddin Kirkor Kısmet Krikor Kutbettin
Lamia Lavin Lerzan
Mahmure Mahperi Maral Masum Mavi Mazlum Mebrure Mecit Medet Memduh Memnune Menşure Mesrure Mihran Mihriban Mihrimah Mihrinaz Mikail Mirhat Mirza Mislina Muaz Muhsine Muhyettin Musab
Nadiye Nagihan Naciye Naime Nalin Narin Nasrullah Naz Nazire Nazmiye Nebi Nebile Necibe Necmeddin Necmiye Nergis Nesim Neslişah Nezir Nigar Nilhan Nimetullah Niyazi Nizamettin Nubar Nuh Nureddin Nurperi Nursel
Ohannes
Perran
Rahşan Ramiz Raşit Reber Remziye Resul Rezzan Rodi Roni Roza Rozerin Ruken Rüstem
Sabahat Sabiha Sadreddin Safa Safinaz Sahra Saime Samiye Satı Sebahat Selman Selver Semahat Servet Seval Sevan Seyfettin Sıddık Sıtkı Silva Sorgül Süheyl
Şahabettin Şahinde Şaziye Şefik Şemseddin Şemsettin Şemsi Şerif Şervan Şevki Şinasi
Taceddin Tacettin Talin Talip Tayyar Tenzile Toros Tuana Tufan Tuğra Tuncer
Ubeydullah Umur Uras Ülfet
Vahdettin Vahide Vakkas Vartan Vasfiye Viyan
Yadigar Yasir Yorgo
Zahir Zana Zennure Zeynelabidin Zeynettin Zihni Ziyaeddin Ziyaettin Zöhre Zülfikar Zülfü Zülküf
`.trim().split(/\s+/).filter((n, i, a) => a.indexOf(n) === i);

// kanonik biçimler: tam (Türkçe küçük harf) eşleşme ve aksan katlanmış (ascii) eşleşme; çakışan katlamalar (Gülsen / Gülşen) kullanıcının yazdığı gibi kalır
const EXACT = new Map(), FOLDED = new Map();
GIVEN.forEach((n) => {
  EXACT.set(lowerTR(n), n);
  const f = fold(n);
  FOLDED.set(f, FOLDED.has(f) && FOLDED.get(f) !== n ? null : n);
});
function givenName(word) {
  const e = EXACT.get(lowerTR(word));
  if (e) return e;
  const f = FOLDED.get(fold(word));
  if (f) return f;
  if (f === null) return titleTR(word); // birden çok ada katlanıyor: yazıldığı gibi kabul
  return '';
}

/* ---------------- küfür / hakaret (katlanmış ve harf tekrarı daraltılmış biçimde karşılaştırılır) ---------------- */
// SUB: sözcük içinde ve sözcükler birleştirilince aranır (ayrık yazımı da yakalar); yalnızca adlarda geçmeyecek kadar belirgin kökler
const SUB = ['orospu', 'orspu', 'orosbu', 'orsbu', 'yarak', 'yarag', 'amcik', 'amcuk', 'amciy', 'aminakoy', 'aminako', 'aminikoy', 'aminasok', 'aminagoy', 'pezevenk', 'kahpe', 'kahbe', 'gavat',
  'ibne', 'ipne', 'yavsak', 'kaltak', 'surtuk', 'kevase', 'dalyarak', 'tasak', 'godos', 'gotveren', 'gotune', 'serefsiz', 'siktir', 'siktig', 'sikerim', 'sikeyim', 'sikis', 'sikici', 'sikko',
  'kerhane', 'fahise', 'porno', 'fuck', 'shit', 'bitch', 'ashole', 'whore', 'slut', 'niger', 'fagot', 'cunt', 'motherf', 'pedofil', 'tecavuz'];
// TOKEN: yalnızca sözcüğün tamamı olarak (adlarda alt dizgi olarak geçebilen kısa kökler)
const TOKEN = ['amk', 'aq', 'amq', 'mk', 'mq', 'oc', 'pic', 'got', 'sik', 'am', 'pust', 'pezo', 'mal', 'salak', 'aptal', 'gerizekali', 'dangalak', 'embesil', 'ahmak', 'hiyar', 'ezik',
  'dingil', 'dalama', 'angut', 'esek', 'yaram', 'anan', 'anani', 'ananin', 'bacin', 'bacini', 'avrad', 'avradini', 'dick', 'fag', 'niga', 'nigas', 'seks', 'sex', 'meme', 'lan', 'ulan', 'oe', 'pic', 'kopek', 'domuz',
  'hayvan', 'ayi', 'odun', 'manyak', 'psikopat', 'sapik', 'it', 'kaka', 'cis', 'osur', 'osuruk'];
const SUBc = SUB.map(collapse), TOKc = new Set(TOKEN.map(collapse));
// rakam / simge ikameleri: s1kt1r, 0r0spu, @mk
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i' };
function profane(text) {
  const raw = lowerTR(String(text || '')).replace(/[013457 89@$!|]/g, (c) => (c === ' ' ? ' ' : LEET[c] || c));
  const parts = raw.split(/[^a-zçğıöşüâîû]+/).filter(Boolean);
  const words = parts.map((w) => collapse(fold(w)));
  if (!words.length) return false;
  const hit = (w) => SUBc.some((s) => w.indexOf(s) >= 0);
  if (words.some((w) => TOKc.has(w) || hit(w))) return true;
  // ayrık yazım ("oros pu", "o r o s p u"): kısa ve ad olmayan parçalar komşusuyla birleştirilip aranır ("Ata Şakir" gibi iki gerçek ad birleştirilmez)
  const loose = (i) => words[i].length <= 3 && !EXACT.has(parts[i]) && !FOLDED.get(words[i]);
  for (let i = 0; i < words.length - 1; i++) if ((loose(i) || loose(i + 1)) && hit(collapse(words[i] + words[i + 1]))) return true;
  if (words.length > 2 && words.every((w) => w.length <= 3) && hit(collapse(words.join('')))) return true;
  return false;
}

/* ---------------- anlamsız yazı / yer tutucu ---------------- */
const PLACEHOLDER = new Set(['test', 'deneme', 'admin', 'administrator', 'user', 'kullanici', 'isim', 'soyisim', 'soyad', 'soyadi', 'adsoyad', 'ad', 'adi', 'adim', 'yok', 'bilinmiyor', 'bilmiyorum',
  'anonim', 'anonymous', 'misafir', 'guest', 'ziyaretci', 'abc', 'abcd', 'asd', 'asdf', 'falan', 'filan', 'fasa', 'fiso', 'ornek', 'sample', 'name', 'surname', 'kimse', 'hic', 'ben', 'sen', 'o', 'biz',
  'kral', 'kralice', 'prens', 'prenses', 'patron', 'baba', 'anne', 'abi', 'abla', 'bey', 'hanim', 'kanka', 'nine', 'yeni', 'kisi', 'insan', 'sahis', 'bos', 'null', 'none', 'undefined']);
const VOWELS = 'aeıioöuüâîû';
const KEYSEQ = ['asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'tyui', 'yuio', 'uiop', 'cvbn', 'vbnm', 'sdf', 'dfg', 'fgh', 'ghj', 'hjk', 'jkl', 'cvb', 'vbn', 'bnm'];
// Türkçede bulunmayan harf öbekleri (yabancı yazım): ch, ph, ck, gh, oo, ee, ou, tz, sonda ünsüz + y, sonda çift ünsüz
// (th / sh bilerek yok: Ethem, Mithat, İshak gibi adlardan türeyen soyadlarında geçer)
const FOREIGN = /ch|ph|ck|gh|oo|ee|ou|tz|[bcçdfgğhjklmnprsştvz]y$|([bcçdfgğhjklmnprsştvyz])\1$/;
function gibberish(w) {
  const f = lowerTR(w).replace(/-/g, '');
  if (f.length < 2) return true;
  if (![...f].some((c) => VOWELS.indexOf(c) >= 0)) return true;           // sesli harfsiz
  if (/([^aeıioöuüâîû]){4,}/.test(f)) return true;                         // 4+ ünsüz yan yana
  if (/(.)\1\1/.test(f)) return true;                                      // aynı harf 3 kez
  if (/(..+?)\1\1/.test(f) || /^(.{3})\1$/.test(f)) return true;           // "asasas", "asdasd" ("Kayakaya" gibi soyadları serbest)
  const fa = fold(f);
  if (KEYSEQ.some((k) => fa.indexOf(k) >= 0)) return true;                 // klavye dizisi
  if (FOREIGN.test(f)) return true;
  const v = [...f].filter((c) => VOWELS.indexOf(c) >= 0).length;
  if (f.length >= 6 && v / f.length < 0.2) return true;
  return false;
}

/* ---------------- ana denetim ---------------- */
// Geri dönüş: { value: 'Ayşe Nur Yılmaz' } ya da { error: 'name', reason: 'words' | 'format' | 'profanity' | 'first' | 'gibberish' }
const LETTERS = /^[a-pr-vyzçğıöşüâîû]+(-[a-pr-vyzçğıöşüâîû]+)?$/; // Türk alfabesi: q, w, x yok
function personName(input) {
  const s = String(input || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s) return { error: 'name', reason: 'words' };
  if (profane(s)) return { error: 'name', reason: 'profanity' };
  const words = s.split(' ');
  if (words.length < 2) return { error: 'name', reason: 'words' };
  if (words.length > 4 || s.length > 80) return { error: 'name', reason: 'format' };
  const low = words.map(lowerTR);
  if (low.some((w) => !LETTERS.test(w) || w.length > 24)) return { error: 'name', reason: 'format' };
  if (low.some((w) => PLACEHOLDER.has(fold(w)))) return { error: 'name', reason: 'gibberish' };
  const first = givenName(words[0]);
  if (!first) return { error: 'name', reason: low.some(gibberish) ? 'gibberish' : 'first' };
  const out = [first];
  for (let i = 1; i < words.length; i++) {
    const g = i < words.length - 1 ? givenName(words[i]) : ''; // ikinci ad (soyad değil) listedeyse kanonik yazılır
    if (g) { out.push(g); continue; }
    if (!EXACT.has(lowerTR(words[i])) && gibberish(words[i])) return { error: 'name', reason: 'gibberish' }; // listedeki ad soyad olarak da geçerlidir
    out.push(titleTR(lowerTR(words[i])));
  }
  return { value: out.join(' ') };
}

module.exports = { personName, profane, givenName, gibberish, fold, titleTR, GIVEN };
