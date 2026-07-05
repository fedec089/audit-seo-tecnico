// Regole: structured data (JSON-LD).

// Set (non esaustivo ma ampio) di tipi schema.org comuni. I tipi fuori da
// questa lista vengono segnalati come "notice" da verificare, non come errore.
const KNOWN_TYPES = new Set([
  // generici
  'Thing', 'WebSite', 'WebPage', 'Organization', 'Corporation', 'NGO',
  'Person', 'Product', 'ProductGroup', 'Offer', 'AggregateOffer', 'Review', 'AggregateRating', 'Rating',
  'BreadcrumbList', 'ListItem', 'ItemList', 'Article', 'NewsArticle', 'BlogPosting', 'Blog', 'TechArticle',
  'FAQPage', 'Question', 'Answer', 'HowTo', 'HowToStep', 'HowToSection', 'Recipe', 'Event', 'VideoObject',
  'ImageObject', 'SearchAction', 'EntryPoint', 'PostalAddress', 'GeoCoordinates', 'GeoShape',
  'OpeningHoursSpecification', 'ContactPoint', 'SiteNavigationElement', 'CollectionPage',
  'ProfilePage', 'AboutPage', 'ContactPage', 'Service', 'Brand', 'JobPosting', 'Course', 'CourseInstance',
  'Place', 'WebApplication', 'SoftwareApplication', 'MobileApplication', 'MediaObject', 'AudioObject',
  'Menu', 'MenuItem', 'Book', 'Movie', 'MusicGroup', 'QAPage', 'SpeakableSpecification',
  'OnlineBusiness', 'OnlineStore', 'OfferCatalog', 'PriceSpecification', 'MonetaryAmount', 'Country',
  // LocalBusiness e il suo sottoalbero (Google le riconosce tutte)
  'LocalBusiness', 'AnimalShelter', 'ArchiveOrganization', 'AutomotiveBusiness', 'AutoBodyShop',
  'AutoDealer', 'AutoPartsStore', 'AutoRental', 'AutoRepair', 'AutoWash', 'GasStation',
  'MotorcycleDealer', 'MotorcycleRepair', 'ChildCare', 'Dentist', 'DryCleaningOrLaundry',
  'EmergencyService', 'FireStation', 'Hospital', 'PoliceStation', 'EmploymentAgency',
  'EntertainmentBusiness', 'AdultEntertainment', 'AmusementPark', 'ArtGallery', 'Casino',
  'ComedyClub', 'MovieTheater', 'NightClub', 'FinancialService', 'AccountingService',
  'AutomatedTeller', 'BankOrCreditUnion', 'InsuranceAgency', 'FoodEstablishment', 'Bakery',
  'BarOrPub', 'Brewery', 'CafeOrCoffeeShop', 'Distillery', 'FastFoodRestaurant', 'IceCreamShop',
  'Restaurant', 'Winery', 'GovernmentOffice', 'PostOffice', 'HealthAndBeautyBusiness', 'BeautySalon',
  'DaySpa', 'HairSalon', 'HealthClub', 'NailSalon', 'TattooParlor', 'HomeAndConstructionBusiness',
  'Electrician', 'GeneralContractor', 'HVACBusiness', 'HousePainter', 'Locksmith', 'MovingCompany',
  'Plumber', 'RoofingContractor', 'InternetCafe', 'LegalService', 'Attorney', 'Notary', 'Library',
  'LodgingBusiness', 'BedAndBreakfast', 'Campground', 'Hostel', 'Hotel', 'Motel', 'Resort',
  'MedicalBusiness', 'MedicalClinic', 'Pharmacy', 'Physician', 'ProfessionalService', 'RadioStation',
  'RealEstateAgent', 'RecyclingCenter', 'SelfStorage', 'ShoppingCenter', 'SportsActivityLocation',
  'BowlingAlley', 'ExerciseGym', 'GolfCourse', 'PublicSwimmingPool', 'SkiResort', 'SportsClub',
  'StadiumOrArena', 'TennisComplex', 'Store', 'BikeStore', 'BookStore', 'ClothingStore',
  'ComputerStore', 'ConvenienceStore', 'DepartmentStore', 'ElectronicsStore', 'Florist',
  'FurnitureStore', 'GardenStore', 'GroceryStore', 'HardwareStore', 'HobbyShop', 'HomeGoodsStore',
  'JewelryStore', 'LiquorStore', 'MensClothingStore', 'MobilePhoneStore', 'MovieRentalStore',
  'MusicStore', 'OfficeEquipmentStore', 'OutletStore', 'PawnShop', 'PetStore', 'ShoeStore',
  'SportingGoodsStore', 'TireShop', 'ToyStore', 'WholesaleStore', 'TelevisionStation',
  'TouristInformationCenter', 'TravelAgency',
]);

function splitTypes(schemaType) {
  if (!schemaType) return [];
  return schemaType.split(',').map((s) => s.trim()).filter(Boolean);
}

export const structuredDataRules = [
  {
    id: 'jsonld-invalid',
    category: 'structured-data',
    severity: 'error',
    message: 'Blocco JSON-LD non parsabile / malformato',
    run(ds) {
      const out = [];
      for (const [url, blocks] of ds.jsonldByUrl.entries()) {
        const bad = blocks.filter((b) => b.parse_ok === 0).length;
        if (bad > 0) out.push({ url, message: `${bad} blocco/i JSON-LD malformati` });
      }
      return out;
    },
  },
  {
    id: 'jsonld-unknown-type',
    category: 'structured-data',
    severity: 'notice',
    message: 'Tipo schema.org non riconosciuto',
    run(ds) {
      const out = [];
      for (const [url, blocks] of ds.jsonldByUrl.entries()) {
        const unknown = new Set();
        for (const b of blocks) {
          if (b.parse_ok === 0) continue;
          for (const t of splitTypes(b.schema_type)) {
            if (!KNOWN_TYPES.has(t)) unknown.add(t);
          }
        }
        if (unknown.size) out.push({ url, detail: { unknownTypes: [...unknown] } });
      }
      return out;
    },
  },
];
