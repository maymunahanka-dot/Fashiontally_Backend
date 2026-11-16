/**
 * Default currency for each country name used by the sign-up forms (web + mobile).
 * New accounts start showing money in this currency; they can change it in Brand settings.
 */
const COUNTRY_CURRENCY = {
  Afghanistan: 'AFN', Albania: 'ALL', Algeria: 'DZD', Angola: 'AOA', Argentina: 'ARS',
  Australia: 'AUD', Austria: 'EUR', Bangladesh: 'BDT', Belgium: 'EUR', Benin: 'XOF',
  Bolivia: 'BOB', Botswana: 'BWP', Brazil: 'BRL', 'Burkina Faso': 'XOF', Burundi: 'BIF',
  'Cabo Verde': 'CVE', Cameroon: 'XAF', Canada: 'CAD', 'Central African Republic': 'XAF',
  Chad: 'XAF', Chile: 'CLP', China: 'CNY', Colombia: 'COP', Comoros: 'KMF', Congo: 'XAF',
  'Congo (Brazzaville)': 'XAF', 'Congo (Kinshasa)': 'CDF', "Côte d'Ivoire": 'XOF',
  'DR Congo': 'CDF', Denmark: 'DKK', Djibouti: 'DJF', Ecuador: 'USD', Egypt: 'EGP',
  'Equatorial Guinea': 'XAF', Eritrea: 'ERN', Eswatini: 'SZL', Ethiopia: 'ETB',
  Finland: 'EUR', France: 'EUR', Gabon: 'XAF', Gambia: 'GMD', Germany: 'EUR', Ghana: 'GHS',
  Greece: 'EUR', Guinea: 'GNF', 'Guinea-Bissau': 'XOF', India: 'INR', Indonesia: 'IDR',
  Iran: 'IRR', Iraq: 'IQD', Ireland: 'EUR', Israel: 'ILS', Italy: 'EUR', Jamaica: 'JMD',
  Japan: 'JPY', Jordan: 'JOD', Kenya: 'KES', Lesotho: 'LSL', Liberia: 'LRD', Libya: 'LYD',
  Madagascar: 'MGA', Malawi: 'MWK', Malaysia: 'MYR', Mali: 'XOF', Mauritania: 'MRU',
  Mauritius: 'MUR', Mexico: 'MXN', Morocco: 'MAD', Mozambique: 'MZN', Namibia: 'NAD',
  Netherlands: 'EUR', 'New Zealand': 'NZD', Niger: 'XOF', Nigeria: 'NGN', Norway: 'NOK',
  Pakistan: 'PKR', Peru: 'PEN', Philippines: 'PHP', Poland: 'PLN', Portugal: 'EUR',
  Romania: 'RON', Russia: 'RUB', Rwanda: 'RWF', 'Saudi Arabia': 'SAR', Senegal: 'XOF',
  Seychelles: 'SCR', 'Sierra Leone': 'SLE', Somalia: 'SOS', 'South Africa': 'ZAR',
  'South Korea': 'KRW', 'South Sudan': 'SSP', Spain: 'EUR', Sudan: 'SDG', Sweden: 'SEK',
  Switzerland: 'CHF', 'São Tomé and Príncipe': 'STN', Tanzania: 'TZS', Thailand: 'THB',
  Togo: 'XOF', Tunisia: 'TND', Turkey: 'TRY', Uganda: 'UGX', Ukraine: 'UAH',
  'United Arab Emirates': 'AED', 'United Kingdom': 'GBP', 'United States': 'USD',
  Venezuela: 'VES', Vietnam: 'VND', Yemen: 'YER', Zambia: 'ZMW', Zimbabwe: 'USD',
};

/** Countries where French is the main language used in business. Everywhere else defaults to English. */
const FRENCH_COUNTRIES = new Set([
  'Algeria', 'Belgium', 'Benin', 'Burkina Faso', 'Burundi', 'Cameroon', 'Central African Republic',
  'Chad', 'Comoros', 'Congo', 'Congo (Brazzaville)', 'Congo (Kinshasa)', "Côte d'Ivoire", 'DR Congo',
  'Djibouti', 'Equatorial Guinea', 'France', 'Gabon', 'Guinea', 'Madagascar', 'Mali', 'Mauritania',
  'Morocco', 'Niger', 'Rwanda', 'Senegal', 'Seychelles', 'Switzerland', 'Togo', 'Tunisia',
]);

/** 'fr' for French-speaking countries, otherwise 'en'. */
const languageForCountry = (country) => {
  const name = String(country || '').trim().toLowerCase();
  return [...FRENCH_COUNTRIES].some((c) => c.toLowerCase() === name) ? 'fr' : 'en';
};

const isCurrencyCode = (value) => /^[A-Z]{3}$/.test(String(value || ''));

/** Currency for a country name ("China" → "CNY"); Naira when unknown. */
const currencyForCountry = (country) => {
  const name = String(country || '').trim();
  if (COUNTRY_CURRENCY[name]) return COUNTRY_CURRENCY[name];
  const match = Object.keys(COUNTRY_CURRENCY).find((c) => c.toLowerCase() === name.toLowerCase());
  return match ? COUNTRY_CURRENCY[match] : 'NGN';
};

module.exports = { COUNTRY_CURRENCY, currencyForCountry, isCurrencyCode, FRENCH_COUNTRIES, languageForCountry };
