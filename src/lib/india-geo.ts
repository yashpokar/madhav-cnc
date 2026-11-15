/**
 * Registry of Indian states and union territories with GST state codes, short
 * codes and a curated list of cities/towns (district headquarters plus
 * well-known cities and industrial towns). Cities are suggestions only: every
 * field that uses them also accepts free text.
 */

export type IndiaState = {
  /** Canonical name, as stored on records. */
  name: string
  /** Two-digit GST state code. */
  gstCode: string
  /** Short code, e.g. GJ. */
  code: string
  isUnionTerritory: boolean
  /** Alphabetically sorted, unique. */
  cities: string[]
}

function cityList(list: string): string[] {
  return Array.from(
    new Set(
      list
        .split(',')
        .map((city) => city.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'en'))
}

function entry(
  name: string,
  gstCode: string,
  code: string,
  cities: string,
  isUnionTerritory = false,
): IndiaState {
  return { name, gstCode, code, isUnionTerritory, cities: cityList(cities) }
}

export const INDIA_STATES: IndiaState[] = [
  entry(
    'Andaman and Nicobar Islands',
    '35',
    'AN',
    'Port Blair, Diglipur, Mayabunder, Rangat, Car Nicobar, Campbell Bay, Hut Bay, Bambooflat, Wandoor, Garacharma, Ferrargunj, Prothrapur',
    true,
  ),
  entry(
    'Andhra Pradesh',
    '37',
    'AP',
    'Visakhapatnam, Vijayawada, Guntur, Nellore, Kurnool, Rajahmundry, Tirupati, Kakinada, Kadapa, Anantapur, Eluru, Ongole, Chittoor, Machilipatnam, Srikakulam, Vizianagaram, Amaravati, Bhimavaram, Tadepalligudem, Tenali, Proddatur, Nandyal, Hindupur, Madanapalle, Adoni, Dharmavaram, Narasaraopet, Chilakaluripet, Tadipatri, Gudivada, Palakollu, Tanuku, Narsapur, Amalapuram, Samalkot, Puttur, Renigunta, Sri City, Parvathipuram, Bapatla, Puttaparthi, Rayachoti, Anakapalle, Markapur, Kavali, Gudur, Srikalahasti, Nuzvid, Mangalagiri, Yemmiganur, Guntakal, Narsipatnam, Bobbili, Salur, Palasa, Ichchapuram, Tuni, Pithapuram, Peddapuram',
  ),
  entry(
    'Arunachal Pradesh',
    '12',
    'AR',
    'Itanagar, Naharlagun, Pasighat, Tawang, Ziro, Bomdila, Tezu, Along, Changlang, Khonsa, Roing, Daporijo, Yingkiong, Seppa, Aalo, Namsai, Anini, Koloriang, Hawai, Basar, Longding, Miao, Bordumsa, Jairampur, Dirang',
  ),
  entry(
    'Assam',
    '18',
    'AS',
    'Guwahati, Dibrugarh, Silchar, Jorhat, Nagaon, Tinsukia, Tezpur, Bongaigaon, Dhubri, Diphu, Goalpara, Barpeta, North Lakhimpur, Karimganj, Sivasagar, Golaghat, Hailakandi, Kokrajhar, Nalbari, Mangaldoi, Morigaon, Dhemaji, Sonari, Haflong, Hojai, Lanka, Margherita, Digboi, Duliajan, Numaligarh, Rangia, Biswanath Chariali, Bokakhat, Abhayapuri, Gohpur, Lumding, Tangla, Dhekiajuli, Mariani, Namrup, Majuli, Udalguri, Bijni',
  ),
  entry(
    'Bihar',
    '10',
    'BR',
    'Patna, Gaya, Bhagalpur, Muzaffarpur, Purnia, Darbhanga, Bihar Sharif, Arrah, Begusarai, Katihar, Munger, Chhapra, Danapur, Saharsa, Sasaram, Hajipur, Dehri, Siwan, Motihari, Nawada, Bagaha, Buxar, Kishanganj, Sitamarhi, Jamalpur, Jehanabad, Aurangabad, Lakhisarai, Samastipur, Madhubani, Araria, Bettiah, Supaul, Gopalganj, Sheikhpura, Jamui, Khagaria, Banka, Madhepura, Mokama, Barh, Forbesganj, Raxaul, Sheohar, Bhabua, Masaurhi, Phulwari Sharif, Rajgir',
  ),
  entry(
    'Chandigarh',
    '04',
    'CH',
    'Chandigarh, Manimajra, Dadumajra, Maloya, Daria, Burail, Sarangpur, Khuda Lahora, Raipur Kalan',
    true,
  ),
  entry(
    'Chhattisgarh',
    '22',
    'CG',
    'Raipur, Bhilai, Bilaspur, Korba, Durg, Rajnandgaon, Raigarh, Jagdalpur, Ambikapur, Dhamtari, Mahasamund, Chirmiri, Kawardha, Kanker, Janjgir, Naila Janjgir, Champa, Jashpur, Bemetara, Baloda Bazar, Balod, Gariaband, Mungeli, Kondagaon, Narayanpur, Dantewada, Bijapur, Sukma, Surajpur, Balrampur, Baikunthpur, Manendragarh, Bhatapara, Dalli Rajhara, Naya Raipur, Kumhari, Charoda, Sakti',
  ),
  entry(
    'Dadra and Nagar Haveli and Daman and Diu',
    '26',
    'DD',
    'Silvassa, Daman, Diu, Amli, Naroli, Khanvel, Dadra, Moti Daman, Nani Daman, Kachigam, Dunetha, Samarvarni, Masat, Kilvani, Bhimpore, Kadaiya, Dabhel, Ghoghla',
    true,
  ),
  entry(
    'Delhi',
    '07',
    'DL',
    'New Delhi, Delhi, Dwarka, Rohini, Karol Bagh, Connaught Place, Narela, Okhla, Mayapuri, Bawana, Mundka, Najafgarh, Janakpuri, Saket, Vasant Kunj, Lajpat Nagar, Pitampura, Laxmi Nagar, Mangolpuri, Wazirpur, Badli, Mehrauli, Kirti Nagar, Nehru Place, Patparganj, Shahdara, Mustafabad',
    true,
  ),
  entry(
    'Goa',
    '30',
    'GA',
    'Panaji, Margao, Vasco da Gama, Mapusa, Ponda, Bicholim, Curchorem, Sanquelim, Cuncolim, Canacona, Pernem, Quepem, Valpoi, Sanguem, Mormugao, Calangute, Candolim, Colva, Benaulim, Verna, Porvorim, Saligao, Anjuna, Arpora, Siolim, Old Goa, Dabolim, Navelim, Pilerne, Sancoale, Cortalim, Bambolim, Taleigao, Dona Paula, Chicalim, Majorda',
  ),
  entry(
    'Gujarat',
    '24',
    'GJ',
    'Ahmedabad, Surat, Vadodara, Rajkot, Bhavnagar, Jamnagar, Gandhinagar, Junagadh, Navsari, Valsad, Vapi, Morbi, Anand, Bharuch, Mehsana, Amreli, Palanpur, Porbandar, Surendranagar, Nadiad, Godhra, Dahod, Patan, Himatnagar, Modasa, Veraval, Botad, Bhuj, Rajpipla, Vyara, Ahwa, Lunawada, Khambhalia, Chhota Udaipur, Radhanpur, Ankleshwar, Bardoli, Bilimora, Gandhidham, Dahej, Dholka, Halol, Kalol, Kadi, Mandvi, Mundra, Palitana, Sanand, Savarkundla, Vijapur, Visnagar, Wankaner, Dhrangadhra, Gondal, Jetpur, Keshod, Mahuva, Okha, Dwarka, Sidhpur, Unjha, Deesa, Kosamba, Sachin, Kim, Olpad, Mangrol, Una, Talaja, Gariadhar, Thangadh, Chotila, Limbdi, Halvad, Dhoraji, Upleta, Padra, Dabhoi, Karjan, Waghodia, Savli, Jambusar, Palsana, Kamrej, Songadh, Umbergaon, Pardi, Dharampur, Jhagadia, Nandesari, Vatva, Naroda, Odhav, Narol, Bavla, Viramgam, Dhandhuka, Idar, Prantij, Kapadvanj, Balasinor, Khambhat, Petlad, Borsad, Umreth, Vallabh Vidyanagar, Sojitra, Mehmedabad, Kheda, Santrampur, Zalod, Devgadh Baria, Vadnagar, Kheralu, Harij, Sami, Tharad, Dhanera, Sihor, Gadhada, Kodinar, Dhrol, Jodiya, Kalavad, Mendarda, Visavadar, Manavadar, Dhari, Lathi, Babra, Bagasara, Shapar, Anjar, Rapar, Bhachau, Nakhatrana, Kandla, Adipur, Samakhiali',
  ),
  entry(
    'Haryana',
    '06',
    'HR',
    'Faridabad, Gurugram, Panipat, Ambala, Yamunanagar, Rohtak, Hisar, Karnal, Sonipat, Panchkula, Bhiwani, Sirsa, Bahadurgarh, Jind, Thanesar, Kaithal, Rewari, Narnaul, Pundri, Kosli, Palwal, Fatehabad, Mahendragarh, Nuh, Charkhi Dadri, Jhajjar, Kurukshetra, Hansi, Tohana, Ladwa, Safidon, Samalkha, Gohana, Manesar, Dharuhera, Bawal, Ballabgarh, Hodal, Mandi Dabwali, Narwana, Barwala, Ellenabad, Assandh, Shahabad, Radaur, Pehowa, Pataudi, Sohna, Farrukhnagar, Ratia, Uklana, Loharu, Siwani, Kalka, Pinjore, Naraingarh, Nilokheri',
  ),
  entry(
    'Himachal Pradesh',
    '02',
    'HP',
    'Shimla, Solan, Dharamshala, Mandi, Baddi, Palampur, Una, Hamirpur, Bilaspur, Kullu, Manali, Nahan, Chamba, Kangra, Nurpur, Paonta Sahib, Parwanoo, Sundarnagar, Kasauli, Reckong Peo, Keylong, Rampur, Rohru, Nalagarh, Barotiwala, Kala Amb, Jogindernagar, Nagrota Bagwan, Dalhousie, Ghumarwin, Arki, Theog, Jawalamukhi, Nadaun, Gagret, Mehatpur, Bhuntar, Banjar, Kufri, Narkanda, Sarkaghat, Baijnath',
  ),
  entry(
    'Jammu and Kashmir',
    '01',
    'JK',
    'Srinagar, Jammu, Anantnag, Baramulla, Udhampur, Kathua, Sopore, Budgam, Pulwama, Kupwara, Bandipora, Ganderbal, Shopian, Kulgam, Rajouri, Poonch, Doda, Kishtwar, Ramban, Reasi, Samba, Akhnoor, Bishnah, Katra, Vijaypur, Nowshera, Sunderbani, Bani, Basholi, Billawar, Hiranagar, Ramnagar, Pampore, Handwara, Tangmarg, Gulmarg, Pahalgam, Bijbehara, Awantipora, Khrew, Pattan, Uri, Banihal, Batote, Bhaderwah, Thathri, Surankote, Mendhar, Kalakote',
    true,
  ),
  entry(
    'Jharkhand',
    '20',
    'JH',
    'Ranchi, Jamshedpur, Dhanbad, Bokaro Steel City, Deoghar, Phusro, Hazaribagh, Giridih, Ramgarh, Medininagar, Chirkunda, Jhumri Telaiya, Sahibganj, Chaibasa, Dumka, Godda, Lohardaga, Pakur, Gumla, Simdega, Khunti, Latehar, Garhwa, Chatra, Koderma, Jamtara, Seraikela, Adityapur, Gamharia, Chakradharpur, Mango, Kandra, Bermo, Chas, Sindri, Barkakana, Patratu, Rajmahal, Madhupur, Chandil, Ghatsila, Jugsalai, Kharsawan, Noamundi, Gomoh, Katras, Jorapokhar',
  ),
  entry(
    'Karnataka',
    '29',
    'KA',
    'Bengaluru, Mysuru, Hubballi, Dharwad, Mangaluru, Belagavi, Kalaburagi, Ballari, Vijayapura, Shivamogga, Tumakuru, Davanagere, Raichur, Bidar, Hosapete, Gadag, Hassan, Udupi, Chitradurga, Mandya, Chikkamagaluru, Kolar, Bagalkot, Haveri, Karwar, Koppal, Chamarajanagar, Madikeri, Yadgir, Ramanagara, Chikkaballapura, Bhadravati, Harihar, Gangavati, Sirsi, Ranebennur, Athani, Nipani, Chikodi, Gokak, Jamkhandi, Mudhol, Yelahanka, Whitefield, Electronic City, Peenya, Jigani, Bommasandra, Nelamangala, Doddaballapura, Hoskote, Devanahalli, Anekal, Attibele, Hebbal, Kengeri, Bidadi, Kushalnagar, Puttur, Sullia, Bantwal, Karkala, Kundapura, Bhatkal, Honnavar, Kumta, Ankola, Dandeli, Sindhanur, Lingasugur, Manvi, Shahpur, Shorapur, Sedam, Aland, Humnabad, Basavakalyan, Bhalki, Channapatna, Magadi, Kanakapura, Tiptur, Sira, Madhugiri, Pavagada, Kunigal, Tarikere, Kadur, Arsikere, Channarayapatna, Nanjangud, Hunsur, Srirangapatna, Malavalli, Nagamangala, Kollegal, Gundlupet, Savanur, Shiggaon, Byadgi, Hirekerur, Harapanahalli, Kudligi, Jagalur, Channagiri, Honnali, Hosadurga, Holalkere, Hiriyur, Challakere',
  ),
  entry(
    'Kerala',
    '32',
    'KL',
    'Thiruvananthapuram, Kochi, Kozhikode, Thrissur, Kollam, Kannur, Alappuzha, Palakkad, Malappuram, Kottayam, Kasaragod, Pathanamthitta, Idukki, Wayanad, Ernakulam, Kalpetta, Painavu, Thodupuzha, Muvattupuzha, Perumbavoor, Aluva, Angamaly, Kakkanad, Thrippunithura, Chalakudy, Irinjalakuda, Kodungallur, Guruvayur, Kunnamkulam, Ottappalam, Shoranur, Chittur, Mannarkkad, Manjeri, Perinthalmanna, Tirur, Ponnani, Kondotty, Nilambur, Vadakara, Koyilandy, Thalassery, Taliparamba, Payyannur, Kanhangad, Nileshwar, Changanassery, Pala, Ettumanoor, Kanjirappally, Cherthala, Kayamkulam, Mavelikkara, Haripad, Chengannur, Thiruvalla, Adoor, Pandalam, Kottarakkara, Punalur, Neyyattinkara, Attingal, Varkala, Nedumangad, Kattakkada, Karunagappally, Paravur, Koothattukulam, Eloor, Kalamassery, Maradu, Edappally, Sulthan Bathery, Mananthavady, Kattappana, Munnar',
  ),
  entry(
    'Ladakh',
    '38',
    'LA',
    'Leh, Kargil, Diskit, Padum, Drass, Nyoma, Khaltsi, Sankoo, Turtuk, Hanle, Panamik, Choglamsar, Saspol, Lamayuru, Alchi, Batalik, Mulbekh, Tangtse',
    true,
  ),
  entry(
    'Lakshadweep',
    '31',
    'LD',
    'Kavaratti, Agatti, Minicoy, Amini, Andrott, Kalpeni, Kadmat, Kiltan, Chetlat, Bitra',
    true,
  ),
  entry(
    'Madhya Pradesh',
    '23',
    'MP',
    'Indore, Bhopal, Jabalpur, Gwalior, Ujjain, Sagar, Dewas, Satna, Ratlam, Rewa, Katni, Singrauli, Burhanpur, Khandwa, Bhind, Chhindwara, Guna, Shivpuri, Vidisha, Chhatarpur, Damoh, Mandsaur, Khargone, Neemuch, Pithampur, Hoshangabad, Narmadapuram, Itarsi, Sehore, Betul, Seoni, Datia, Nagda, Morena, Dhar, Balaghat, Sidhi, Shahdol, Umaria, Tikamgarh, Panna, Alirajpur, Jhabua, Barwani, Harda, Raisen, Rajgarh, Shajapur, Anuppur, Dindori, Mandla, Narsinghpur, Ashoknagar, Sheopur, Maihar, Pandhurna, Mhow, Mandideep, Sendhwa, Maheshwar, Khajuraho, Pachmarhi, Amarkantak, Sarni, Pipariya, Gadarwara, Bina, Ashta, Sanawad, Barwaha, Badnawar, Petlawad, Thandla, Meghnagar, Manawar',
  ),
  entry(
    'Maharashtra',
    '27',
    'MH',
    'Mumbai, Pune, Nagpur, Thane, Nashik, Aurangabad, Chhatrapati Sambhajinagar, Solapur, Kolhapur, Amravati, Navi Mumbai, Sangli, Jalgaon, Akola, Latur, Dhule, Ahmednagar, Chandrapur, Parbhani, Ichalkaranji, Jalna, Ambarnath, Bhiwandi, Nanded, Malegaon, Ulhasnagar, Kalyan, Dombivli, Vasai, Virar, Mira Bhayandar, Panvel, Satara, Beed, Yavatmal, Kamptee, Gondia, Barshi, Achalpur, Osmanabad, Nandurbar, Wardha, Udgir, Hinganghat, Bhusawal, Washim, Buldhana, Hingoli, Gadchiroli, Bhandara, Ratnagiri, Sindhudurg, Alibag, Palghar, Boisar, Tarapur, Khopoli, Lonavala, Pimpri-Chinchwad, Chakan, Talegaon, Ranjangaon, Baramati, Karad, Phaltan, Miraj, Shirpur, Sinnar, Igatpuri, Shirdi, Sangamner, Kopargaon, Rahuri, Shrirampur, Pandharpur, Ambajogai, Parli, Umred, Butibori, Hingna, Katol, Ramtek, Saoner, Pusad, Digras, Wani, Ballarpur, Warora, Chiplun, Khed, Dapoli, Mahad, Panchgani, Mahabaleshwar, Wai, Islampur, Tasgaon, Jejuri, Shirur, Daund, Indapur, Junnar, Narayangaon, Manchar, Rajgurunagar, Hadapsar, Wagholi, Hinjewadi, Kharadi',
  ),
  entry(
    'Manipur',
    '14',
    'MN',
    'Imphal, Thoubal, Bishnupur, Churachandpur, Kakching, Ukhrul, Senapati, Tamenglong, Jiribam, Chandel, Moreh, Kangpokpi, Noney, Pherzawl, Kamjong, Tengnoupal, Lilong, Nambol, Moirang, Yairipok, Wangjing, Sekmai, Sagolband, Porompat, Heingang, Wangoi',
  ),
  entry(
    'Meghalaya',
    '17',
    'ML',
    'Shillong, Tura, Jowai, Nongpoh, Baghmara, Williamnagar, Nongstoin, Mawkyrwat, Resubelpara, Ampati, Khliehriat, Mairang, Cherrapunji, Mawlynnong, Byrnihat, Umiam, Dawki, Mawphlang, Nongthymmai, Laitumkhrah, Mawlai, Umroi, Mendipathar, Dalu, Amlarem',
  ),
  entry(
    'Mizoram',
    '15',
    'MZ',
    'Aizawl, Lunglei, Champhai, Serchhip, Kolasib, Saiha, Lawngtlai, Mamit, Khawzawl, Saitual, Hnahthial, Vairengte, Bairabi, Zawlnuam, Darlawn, Thenzawl, Biate, Sairang, Zokhawthar, Tuipang, Lengpui, Durtlang, Chaltlang, Zemabawk',
  ),
  entry(
    'Nagaland',
    '13',
    'NL',
    'Kohima, Dimapur, Mokokchung, Tuensang, Wokha, Zunheboto, Phek, Mon, Longleng, Kiphire, Peren, Noklak, Chumukedima, Tizit, Medziphema, Niuland, Tseminyu, Shamator, Jalukie, Pfutsero, Aboi, Changtongya, Tamlu, Bhandari, Dhansiripar, Satakha, Tuli, Naginimora, Merapani',
  ),
  entry(
    'Odisha',
    '21',
    'OD',
    'Bhubaneswar, Cuttack, Rourkela, Berhampur, Sambalpur, Puri, Balasore, Bhadrak, Baripada, Jharsuguda, Jeypore, Barbil, Bargarh, Angul, Dhenkanal, Kendujhar, Rayagada, Koraput, Paradip, Jajpur, Kendrapara, Jagatsinghpur, Balangir, Sundargarh, Talcher, Brajrajnagar, Phulbani, Nabarangpur, Malkangiri, Nayagarh, Khordha, Deogarh, Sonepur, Boudh, Paralakhemundi, Gopalpur, Chhatrapur, Aska, Hinjilicut, Jatni, Choudwar, Banki, Athagarh, Chandbali, Joda, Kuchinda, Rairangpur, Karanjia, Soro, Jaleswar, Bhawanipatna, Rajgangpur, Lanjigarh, Belpahar, Hirakud, Sunabeda, Titlagarh, Kantabanji, Patnagarh, Khariar, Nuapada, Dharamgarh, Bhanjanagar, Digapahandi',
  ),
  entry(
    'Puducherry',
    '34',
    'PY',
    'Puducherry, Karaikal, Mahe, Yanam, Ozhukarai, Villianur, Ariyankuppam, Bahour, Mannadipet, Nettapakkam, Thirubhuvanai, Lawspet, Muthialpet, Reddiarpalayam, Kalapet, Auroville, Thirunallar',
    true,
  ),
  entry(
    'Punjab',
    '03',
    'PB',
    'Ludhiana, Amritsar, Jalandhar, Patiala, Bathinda, Mohali, Pathankot, Hoshiarpur, Moga, Batala, Abohar, Malerkotla, Khanna, Phagwara, Muktsar, Barnala, Rajpura, Firozpur, Kapurthala, Faridkot, Sangrur, Fazilka, Gurdaspur, Mansa, Nawanshahr, Rupnagar, Tarn Taran, Fatehgarh Sahib, Zirakpur, Kharar, Dera Bassi, Mandi Gobindgarh, Nabha, Samana, Sunam, Dhuri, Longowal, Ahmedgarh, Raikot, Jagraon, Doraha, Samrala, Machhiwara, Banga, Nakodar, Phillaur, Goraya, Nurmahal, Dasuya, Mukerian, Talwara, Dhariwal, Ajnala, Patti, Zira, Jalalabad, Malout, Gidderbaha, Talwandi Sabo, Rampura Phul, Budhlada, Sardulgarh, Tapa',
  ),
  entry(
    'Rajasthan',
    '08',
    'RJ',
    'Jaipur, Jodhpur, Kota, Bikaner, Ajmer, Udaipur, Bhilwara, Alwar, Bharatpur, Sikar, Pali, Sri Ganganagar, Kishangarh, Beawar, Tonk, Hanumangarh, Churu, Jhunjhunu, Nagaur, Barmer, Jaisalmer, Chittorgarh, Sawai Madhopur, Dholpur, Bundi, Baran, Jhalawar, Karauli, Banswara, Dungarpur, Pratapgarh, Rajsamand, Sirohi, Jalore, Dausa, Mount Abu, Bhiwadi, Neemrana, Behror, Khushkhera, Abu Road, Nathdwara, Phalodi, Balotra, Pokaran, Sujangarh, Ratangarh, Fatehpur, Nawalgarh, Khetri, Chomu, Shahpura, Kotputli, Bagru, Sanganer, Sitapura, Bassi, Phulera, Sambhar, Makrana, Parbatsar, Kuchaman, Didwana, Bhinmal, Sanchore, Sheoganj, Sumerpur, Falna, Bali, Sojat, Marwar Junction, Nohar, Suratgarh, Anupgarh, Raisinghnagar, Padampur',
  ),
  entry(
    'Sikkim',
    '11',
    'SK',
    'Gangtok, Namchi, Gyalshing, Mangan, Pakyong, Soreng, Singtam, Rangpo, Jorethang, Ravangla, Melli, Rhenock, Chungthang, Lachung, Lachen, Pelling, Yuksom, Rumtek, Ranipool, Majitar, Namthang, Dentam, Legship, Rongli, Reshi, Sombaria, Dikchu, Tadong',
  ),
  entry(
    'Tamil Nadu',
    '33',
    'TN',
    'Chennai, Coimbatore, Madurai, Tiruchirappalli, Salem, Tirunelveli, Tiruppur, Erode, Vellore, Thoothukudi, Dindigul, Thanjavur, Hosur, Nagercoil, Kanchipuram, Karur, Cuddalore, Kumbakonam, Rajapalayam, Pudukkottai, Ambur, Namakkal, Tiruvannamalai, Sivakasi, Karaikudi, Neyveli, Ariyalur, Perambalur, Krishnagiri, Dharmapuri, Theni, Virudhunagar, Ramanathapuram, Sivaganga, Nagapattinam, Mayiladuthurai, Tiruvarur, Tenkasi, Kallakurichi, Ranipet, Tirupathur, Chengalpattu, Tiruvallur, Villupuram, Ooty, Coonoor, Pollachi, Mettupalayam, Udumalaipettai, Palladam, Avinashi, Gobichettipalayam, Bhavani, Perundurai, Sathyamangalam, Attur, Mettur, Omalur, Rasipuram, Tiruchengode, Pallipalayam, Komarapalayam, Vaniyambadi, Gudiyatham, Arakkonam, Walajapet, Sriperumbudur, Oragadam, Maraimalai Nagar, Avadi, Ambattur, Poonamallee, Tambaram, Pallavaram, Gummidipoondi, Ponneri, Mahabalipuram, Cheyyar, Arni, Polur, Vandavasi, Tindivanam, Gingee, Chidambaram, Vriddhachalam, Panruti, Kovilpatti, Srivilliputhur, Aruppukkottai, Paramakudi, Rameswaram, Devakottai, Manamadurai, Palani, Oddanchatram, Batlagundu, Periyakulam, Bodinayakanur, Cumbum, Kodaikanal, Thuraiyur, Lalgudi, Musiri, Manapparai, Pattukkottai, Mannargudi, Sirkazhi',
  ),
  entry(
    'Telangana',
    '36',
    'TS',
    'Hyderabad, Warangal, Nizamabad, Karimnagar, Khammam, Ramagundam, Mahbubnagar, Nalgonda, Adilabad, Suryapet, Siddipet, Miryalaguda, Jagtial, Mancherial, Nirmal, Kamareddy, Sangareddy, Medak, Vikarabad, Wanaparthy, Gadwal, Nagarkurnool, Mahabubabad, Bhongir, Jangaon, Peddapalli, Sircilla, Kothagudem, Bhadrachalam, Asifabad, Kagaznagar, Bodhan, Armoor, Kodad, Huzurnagar, Secunderabad, Ghatkesar, Patancheru, Medchal, Shamshabad, Shadnagar, Ibrahimpatnam, Hayathnagar, Uppal, Kukatpally, Gachibowli, Madhapur, Jeedimetla, Balanagar, Bollaram, Pashamylaram, Zaheerabad, Narayankhed, Narsapur, Toopran, Gajwel, Dubbaka, Husnabad, Huzurabad, Manthani, Godavarikhani, Bellampalli, Bhainsa, Koratla, Vemulawada, Banswada, Kollapur, Alampur, Achampet, Kalwakurthy, Tandur, Parigi, Chevella, Narayanpet, Makthal, Devarkonda, Nakrekal, Mulugu',
  ),
  entry(
    'Tripura',
    '16',
    'TR',
    'Agartala, Udaipur, Dharmanagar, Kailasahar, Belonia, Khowai, Ambassa, Teliamura, Sabroom, Sonamura, Bishalgarh, Amarpur, Kamalpur, Santirbazar, Jirania, Mohanpur, Melaghar, Kumarghat, Panisagar, Kanchanpur, Longtharai, Bagafa, Matabari, Boxanagar, Birganj, Rajnagar, Ranirbazar',
  ),
  entry(
    'Uttar Pradesh',
    '09',
    'UP',
    'Lucknow, Kanpur, Ghaziabad, Agra, Varanasi, Meerut, Prayagraj, Bareilly, Aligarh, Moradabad, Saharanpur, Gorakhpur, Noida, Greater Noida, Firozabad, Jhansi, Muzaffarnagar, Mathura, Vrindavan, Ayodhya, Rampur, Shahjahanpur, Farrukhabad, Hapur, Etawah, Mirzapur, Bulandshahr, Sambhal, Amroha, Hardoi, Fatehpur, Raebareli, Orai, Sitapur, Bahraich, Modinagar, Unnao, Jaunpur, Lakhimpur Kheri, Hathras, Banda, Pilibhit, Barabanki, Khurja, Gonda, Mainpuri, Lalitpur, Etah, Deoria, Ghazipur, Sultanpur, Azamgarh, Bijnor, Basti, Chandausi, Akbarpur, Ballia, Mau, Mughalsarai, Kasganj, Auraiya, Baghpat, Balrampur, Chandauli, Chitrakoot, Faizabad, Hamirpur, Kannauj, Kushinagar, Maharajganj, Mahoba, Pratapgarh, Shamli, Shravasti, Siddharthnagar, Sonbhadra, Amethi, Bhadohi, Kaushambi, Budaun, Dadri, Jewar, Sikandrabad, Gajraula, Kairana, Deoband, Obra, Renukoot, Anpara, Sandila, Tanda, Khalilabad, Padrauna, Bansi, Phulpur, Handia, Chunar, Shikohabad, Tundla, Kosi Kalan, Pilkhuwa, Garhmukteshwar, Mawana, Khatauli, Budhana, Baraut, Loni, Muradnagar, Sahibabad',
  ),
  entry(
    'Uttarakhand',
    '05',
    'UK',
    'Dehradun, Haridwar, Roorkee, Haldwani, Rudrapur, Kashipur, Rishikesh, Pithoragarh, Ramnagar, Nainital, Almora, Mussoorie, Kotdwar, Srinagar, Pauri, Tehri, Uttarkashi, Chamoli, Gopeshwar, Rudraprayag, Bageshwar, Champawat, Lohaghat, Sitarganj, Kichha, Jaspur, Bazpur, Gadarpur, Khatima, Tanakpur, Sahaspur, Vikasnagar, Doiwala, Herbertpur, Selaqui, Bhagwanpur, Laksar, Jwalapur, Manglaur, Landhaura, Narendranagar, New Tehri, Dwarahat, Ranikhet, Bhimtal, Kathgodam, Lalkuan, Pantnagar, Munsiyari, Dharchula, Karnaprayag, Joshimath, Barkot, Purola, Chakrata',
  ),
  entry(
    'West Bengal',
    '19',
    'WB',
    'Kolkata, Howrah, Durgapur, Asansol, Siliguri, Bardhaman, Malda, English Bazar, Kharagpur, Haldia, Darjeeling, Jalpaiguri, Cooch Behar, Baharampur, Raiganj, Krishnanagar, Nabadwip, Medinipur, Bankura, Purulia, Balurghat, Bolpur, Santiniketan, Suri, Barasat, Dum Dum, Bidhannagar, Salt Lake, New Town, Rajarhat, Barrackpore, Serampore, Chandannagar, Chinsurah, Hooghly, Uttarpara, Baranagar, Kamarhati, Titagarh, Bally, Bhatpara, Naihati, Kalyani, Habra, Basirhat, Bongaon, Baruipur, Diamond Harbour, Jaigaon, Alipurduar, Kalimpong, Kurseong, Mirik, Dhupguri, Mathabhanga, Dinhata, Tufanganj, Islampur, Dalkhola, Gangarampur, Murshidabad, Jangipur, Dhulian, Farakka, Rampurhat, Sainthia, Dubrajpur, Katwa, Kalna, Guskara, Raniganj, Kulti, Burnpur, Jamuria, Pandabeswar, Bishnupur, Sonamukhi, Jhargram, Ghatal, Tamluk, Contai, Egra, Digha, Panskura, Kolaghat, Sankrail, Dankuni, Uluberia, Bagnan, Amta, Joka, Sonarpur, Budge Budge, Behala, Tollygunge, Jadavpur, Garia, Madhyamgram, Sodepur, Khardah, Panihati, Belgharia, Agarpara, Birati, Baguiati',
  ),
]

const BY_NAME = new Map<string, IndiaState>()
const BY_CODE = new Map<string, IndiaState>()
const BY_GST = new Map<string, IndiaState>()

function key(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

for (const state of INDIA_STATES) {
  BY_NAME.set(key(state.name), state)
  BY_CODE.set(state.code.toLowerCase(), state)
  BY_GST.set(state.gstCode, state)
}

/** Alternative spellings and former names, keyed by `key()` form. */
const STATE_ALIASES: Record<string, string> = {
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
  uttrakhand: 'Uttarakhand',
  pondicherry: 'Puducherry',
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'jammu kashmir': 'Jammu and Kashmir',
  'jammu and kashmir': 'Jammu and Kashmir',
  'andaman nicobar islands': 'Andaman and Nicobar Islands',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'andaman nicobar': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman diu': 'Dadra and Nagar Haveli and Daman and Diu',
  chattisgarh: 'Chhattisgarh',
  chhatisgarh: 'Chhattisgarh',
  tamilnadu: 'Tamil Nadu',
  telengana: 'Telangana',
  gujrat: 'Gujarat',
  karnatka: 'Karnataka',
  maharastra: 'Maharashtra',
  'u p': 'Uttar Pradesh',
  'm p': 'Madhya Pradesh',
  'a p': 'Andhra Pradesh',
  'h p': 'Himachal Pradesh',
  tg: 'Telangana',
}

/**
 * Look up a state from forgiving text: canonical name, former name or common
 * misspelling (Orissa, Pondicherry), or its two-letter code (GJ, mh).
 */
export function normaliseState(text: string | null | undefined): IndiaState | null {
  const raw = (text ?? '').trim()
  if (!raw) return null

  const k = key(raw)
  const direct = BY_NAME.get(k)
  if (direct) return direct

  const alias = STATE_ALIASES[k]
  if (alias) return BY_NAME.get(key(alias)) ?? null

  if (/^[a-z]{2}$/.test(k)) return BY_CODE.get(k) ?? null

  return null
}

/** Canonical state name for forgiving input, or null when unknown. */
export function normaliseStateName(text: string | null | undefined): string | null {
  return normaliseState(text)?.name ?? null
}

export function stateByName(name: string | null | undefined): IndiaState | null {
  return normaliseState(name)
}

/** By two-digit GST code ("24") or short code ("GJ"). */
export function stateByCode(code: string | null | undefined): IndiaState | null {
  const raw = (code ?? '').trim()
  if (!raw) return null

  return BY_GST.get(raw) ?? BY_CODE.get(raw.toLowerCase()) ?? null
}

/** The two digits at the start of a GSTIN, or null when not numeric. */
export function gstinStateCode(gstin: string | null | undefined): string | null {
  const code = (gstin ?? '').trim().slice(0, 2)

  return /^\d{2}$/.test(code) ? code : null
}

/** State of a GSTIN (first two digits), or null when unknown. */
export function stateFromGstin(gstin: string | null | undefined): IndiaState | null {
  const code = gstinStateCode(gstin)

  return code ? (BY_GST.get(code) ?? null) : null
}

export function isValidPincode(pincode: string | null | undefined): boolean {
  return /^[1-9][0-9]{5}$/.test((pincode ?? '').trim())
}

type PinRule = [from: number, to: number, state: string]

/** Small enclaves inside another state's postal range; checked first. */
const PIN_EXACT: PinRule[] = [
  [682551, 682559, 'Lakshadweep'],
  [673310, 673311, 'Puducherry'], // Mahe
  [533464, 533464, 'Puducherry'], // Yanam
  [609602, 609609, 'Puducherry'], // Karaikal
  [607402, 607403, 'Puducherry'], // Bahour
]

/**
 * First three digits of a pincode. Only ranges that belong to one state
 * throughout are listed; shared postal circles are left out on purpose:
 * 160 (Chandigarh / Punjab), 244-247 and 262-263 (Uttar Pradesh /
 * Uttarakhand), 396 (Gujarat / Dadra and Nagar Haveli and Daman and Diu),
 * 605 and 607 (Puducherry / Tamil Nadu), 813 and 817-824 (Bihar / Jharkhand).
 */
const PIN_PREFIX: PinRule[] = [
  [110, 110, 'Delhi'],
  [121, 136, 'Haryana'],
  [140, 152, 'Punjab'],
  [171, 177, 'Himachal Pradesh'],
  [180, 193, 'Jammu and Kashmir'],
  [194, 194, 'Ladakh'],
  [201, 243, 'Uttar Pradesh'],
  [245, 245, 'Uttar Pradesh'],
  [248, 249, 'Uttarakhand'],
  [250, 261, 'Uttar Pradesh'],
  [264, 285, 'Uttar Pradesh'],
  [301, 345, 'Rajasthan'],
  [360, 395, 'Gujarat'],
  [400, 402, 'Maharashtra'],
  [403, 403, 'Goa'],
  [410, 445, 'Maharashtra'],
  [450, 488, 'Madhya Pradesh'],
  [490, 497, 'Chhattisgarh'],
  [500, 509, 'Telangana'],
  [515, 535, 'Andhra Pradesh'],
  [560, 591, 'Karnataka'],
  [600, 604, 'Tamil Nadu'],
  [606, 606, 'Tamil Nadu'],
  [608, 643, 'Tamil Nadu'],
  [670, 695, 'Kerala'],
  [700, 736, 'West Bengal'],
  [737, 737, 'Sikkim'],
  [740, 743, 'West Bengal'],
  [744, 744, 'Andaman and Nicobar Islands'],
  [751, 770, 'Odisha'],
  [781, 788, 'Assam'],
  [790, 792, 'Arunachal Pradesh'],
  [793, 794, 'Meghalaya'],
  [795, 795, 'Manipur'],
  [796, 796, 'Mizoram'],
  [797, 798, 'Nagaland'],
  [799, 799, 'Tripura'],
  [800, 812, 'Bihar'],
  [814, 816, 'Jharkhand'],
  [825, 835, 'Jharkhand'],
  [841, 855, 'Bihar'],
]

/**
 * Best-effort state for a pincode, where the postal circle identifies it
 * unambiguously. Returns null for invalid pincodes and shared circles.
 */
export function stateFromPincode(pincode: string | null | undefined): IndiaState | null {
  const pin = (pincode ?? '').trim()
  if (!isValidPincode(pin)) return null

  const full = Number(pin)
  const exact = PIN_EXACT.find(([from, to]) => full >= from && full <= to)
  if (exact) return BY_NAME.get(key(exact[2])) ?? null

  const prefix = Number(pin.slice(0, 3))
  const rule = PIN_PREFIX.find(([from, to]) => prefix >= from && prefix <= to)

  return rule ? (BY_NAME.get(key(rule[2])) ?? null) : null
}

export function citiesFor(state: string | null | undefined): string[] {
  return normaliseState(state)?.cities ?? []
}

const CITY_ALIASES: Record<string, string> = {
  ahmadabad: 'Ahmedabad',
  baroda: 'Vadodara',
  bombay: 'Mumbai',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  bangalore: 'Bengaluru',
  mysore: 'Mysuru',
  gurgaon: 'Gurugram',
  allahabad: 'Prayagraj',
  poona: 'Pune',
  trivandrum: 'Thiruvananthapuram',
  cochin: 'Kochi',
  calicut: 'Kozhikode',
  trichy: 'Tiruchirappalli',
  vizag: 'Visakhapatnam',
  banaras: 'Varanasi',
}

/**
 * The canonical spelling of a city within a state (case, spacing and common
 * alternative names forgiven), or null when it is not in that state's list.
 */
export function canonicalCity(
  state: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const wanted = key(city ?? '')
  if (!wanted) return null

  const target = key(CITY_ALIASES[wanted] ?? wanted)

  return citiesFor(state).find((candidate) => key(candidate) === target) ?? null
}
