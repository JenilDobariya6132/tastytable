const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.MYSQL_PASSWORD || 'Jenil@2007';
const DB_NAME = process.env.MYSQL_DATABASE || 'cookvala';

const AUTHOR_ID = 3;
const AUTHOR_NAME = 'jenil';

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

const recipes = [
  // Breakfast
  {
    name: "Masala Dosa",
    category: "Breakfast",
    prep_time: "10 hours",
    cook_time: "20 min",
    servings: "4",
    calories: 300,
    intro: "Crispy rice crepes filled with spiced potato masala.",
    ingredients: ["2 cups Rice", "1 cup Urad Dal", "Potatoes", "Onions", "Mustard seeds", "Turmeric"],
    instructions: ["Soak rice and dal overnight.", "Grind to batter and ferment.", "Make potato masala.", "Spread batter on hot griddle.", "Fill with masala and serve."]
  },
  {
    name: "Poha",
    category: "Breakfast",
    prep_time: "10 min",
    cook_time: "15 min",
    servings: "2",
    calories: 250,
    intro: "Flattened rice sautéed with onions, potatoes, and spices.",
    ingredients: ["2 cups Poha", "1 Onion", "1 Potato", "Peanuts", "Curry leaves", "Turmeric"],
    instructions: ["Rinse poha.", "Sauté peanuts, onions, and potatoes.", "Add spices and poha.", "Mix well and serve with lemon."]
  },
  {
    name: "Aloo Paratha",
    category: "Breakfast",
    prep_time: "20 min",
    cook_time: "15 min",
    servings: "4",
    calories: 400,
    intro: "Whole wheat flatbread stuffed with spiced mashed potatoes.",
    ingredients: ["2 cups Wheat flour", "4 Potatoes", "Green chilies", "Coriander", "Garam masala"],
    instructions: ["Make dough.", "Boil and mash potatoes with spices.", "Stuff dough with potato mixture.", "Roll out and cook on tawa with ghee."]
  },
  {
    name: "Idli Sambar",
    category: "Breakfast",
    prep_time: "10 hours",
    cook_time: "20 min",
    servings: "4",
    calories: 200,
    intro: "Steamed rice cakes served with lentil soup.",
    ingredients: ["2 cups Rice", "1 cup Urad Dal", "Toor Dal", "Vegetables", "Sambar powder"],
    instructions: ["Ferment batter.", "Steam idlis.", "Cook lentils with veggies and sambar powder.", "Serve hot."]
  },
  {
    name: "Upma",
    category: "Breakfast",
    prep_time: "10 min",
    cook_time: "15 min",
    servings: "2",
    calories: 280,
    intro: "Savory semolina porridge with vegetables.",
    ingredients: ["1 cup Semolina (Rava)", "Onion", "Carrot", "Peas", "Mustard seeds"],
    instructions: ["Roast rava.", "Sauté veggies and spices.", "Add water and boil.", "Add rava and cook until fluffy."]
  },

  // Lunch
  {
    name: "Rajma Chawal",
    category: "Lunch",
    prep_time: "8 hours",
    cook_time: "45 min",
    servings: "4",
    calories: 450,
    intro: "Red kidney beans curry served with steamed rice.",
    ingredients: ["1 cup Rajma", "Onions", "Tomatoes", "Ginger Garlic paste", "Rice"],
    instructions: ["Soak and boil rajma.", "Make gravy with onions and tomatoes.", "Simmer rajma in gravy.", "Serve with rice."]
  },
  {
    name: "Chicken Biryani",
    category: "Lunch",
    prep_time: "1 hour",
    cook_time: "45 min",
    servings: "4",
    calories: 600,
    intro: "Aromatic basmati rice cooked with spiced chicken.",
    ingredients: ["500g Chicken", "2 cups Basmati Rice", "Yogurt", "Fried Onions", "Biryani Masala"],
    instructions: ["Marinate chicken.", "Par-boil rice.", "Layer chicken and rice.", "Cook on dum (slow heat)."]
  },
  {
    name: "Paneer Butter Masala",
    category: "Lunch",
    prep_time: "15 min",
    cook_time: "30 min",
    servings: "3",
    calories: 550,
    intro: "Cottage cheese cubes in a rich tomato-cashew gravy.",
    ingredients: ["200g Paneer", "Tomatoes", "Cashews", "Cream", "Butter", "Garam Masala"],
    instructions: ["Make tomato-cashew paste.", "Cook paste with spices and butter.", "Add paneer cubes.", "Finish with cream."]
  },
  {
    name: "Dal Makhani",
    category: "Lunch",
    prep_time: "8 hours",
    cook_time: "1 hour",
    servings: "4",
    calories: 400,
    intro: "Creamy black lentils cooked with butter and spices.",
    ingredients: ["1 cup Black Urad Dal", "Kidney beans", "Butter", "Cream", "Tomato puree"],
    instructions: ["Soak and pressure cook lentils.", "Simmer with spices and tomato puree.", "Add butter and cream.", "Cook slow for flavor."]
  },
  {
    name: "Bhindi Masala",
    category: "Lunch",
    prep_time: "15 min",
    cook_time: "20 min",
    servings: "3",
    calories: 200,
    intro: "Okra stir-fried with onions and spices.",
    ingredients: ["500g Bhindi (Okra)", "Onions", "Tomatoes", "Cumin", "Coriander powder"],
    instructions: ["Wash and dry bhindi.", "Sauté with onions and spices.", "Cook until tender but not slimey."]
  },

  // Dinner
  {
    name: "Palak Paneer",
    category: "Dinner",
    prep_time: "20 min",
    cook_time: "30 min",
    servings: "3",
    calories: 350,
    intro: "Cottage cheese in a smooth spinach gravy.",
    ingredients: ["Spinach", "200g Paneer", "Onions", "Garlic", "Cream"],
    instructions: ["Blanch and puree spinach.", "Sauté spices and onion-garlic.", "Add spinach puree and paneer.", "Simmer."]
  },
  {
    name: "Rogan Josh",
    category: "Dinner",
    prep_time: "20 min",
    cook_time: "1 hour",
    servings: "4",
    calories: 500,
    intro: "Aromatic Kashmiri lamb curry.",
    ingredients: ["500g Lamb/Mutton", "Yogurt", "Kashmiri Chili", "Fennel powder", "Ginger"],
    instructions: ["Brown the meat.", "Cook with spices and yogurt.", "Simmer until meat is tender."]
  },
  {
    name: "Malai Kofta",
    category: "Dinner",
    prep_time: "30 min",
    cook_time: "40 min",
    servings: "4",
    calories: 600,
    intro: "Fried potato-paneer dumplings in a creamy gravy.",
    ingredients: ["Potatoes", "Paneer", "Cashews", "Cream", "Tomatoes"],
    instructions: ["Make koftas (balls) and fry.", "Prepare rich gravy.", "Add koftas just before serving."]
  },
  {
    name: "Fish Curry",
    category: "Dinner",
    prep_time: "20 min",
    cook_time: "30 min",
    servings: "3",
    calories: 400,
    intro: "Tangy and spicy fish curry.",
    ingredients: ["500g Fish", "Tamarind", "Coconut milk", "Curry leaves", "Mustard seeds"],
    instructions: ["Marinate fish.", "Make gravy with tamarind and spices.", "Add fish and coconut milk.", "Simmer gently."]
  },
  {
    name: "Vegetable Korma",
    category: "Dinner",
    prep_time: "20 min",
    cook_time: "30 min",
    servings: "4",
    calories: 350,
    intro: "Mixed vegetables in a coconut-cashew sauce.",
    ingredients: ["Mixed Veggies", "Coconut", "Cashews", "Poppy seeds", "Spices"],
    instructions: ["Boil veggies.", "Make coconut paste.", "Cook paste with spices.", "Add veggies and simmer."]
  },

  // Dessert
  {
    name: "Gulab Jamun",
    category: "Dessert",
    prep_time: "20 min",
    cook_time: "30 min",
    servings: "10",
    calories: 200,
    intro: "Deep-fried milk solids soaked in sugar syrup.",
    ingredients: ["Milk powder", "Maida", "Sugar", "Cardamom", "Rose water"],
    instructions: ["Make dough.", "Shape into balls and fry.", "Soak in hot sugar syrup."]
  },
  {
    name: "Rasmalai",
    category: "Dessert",
    prep_time: "30 min",
    cook_time: "40 min",
    servings: "6",
    calories: 300,
    intro: "Soft cheese patties in sweet saffron milk.",
    ingredients: ["Milk", "Lemon juice", "Sugar", "Saffron", "Pistachios"],
    instructions: ["Make chenna (cheese) from milk.", "Cook patties in syrup.", "Soak in thickened sweetened milk."]
  },
  {
    name: "Gajar Ka Halwa",
    category: "Dessert",
    prep_time: "20 min",
    cook_time: "45 min",
    servings: "6",
    calories: 350,
    intro: "Sweet carrot pudding with nuts.",
    ingredients: ["Carrots", "Milk", "Sugar", "Ghee", "Nuts"],
    instructions: ["Grate carrots.", "Cook with milk until dry.", "Add sugar and ghee.", "Garnish with nuts."]
  },
  {
    name: "Kheer",
    category: "Dessert",
    prep_time: "5 min",
    cook_time: "40 min",
    servings: "4",
    calories: 250,
    intro: "Rice pudding flavored with cardamom.",
    ingredients: ["Milk", "Rice", "Sugar", "Cardamom", "Almonds"],
    instructions: ["Boil milk.", "Add rice and cook until soft.", "Add sugar and cardamom.", "Serve hot or cold."]
  },
  {
    name: "Jalebi",
    category: "Dessert",
    prep_time: "12 hours",
    cook_time: "30 min",
    servings: "6",
    calories: 400,
    intro: "Crispy fried spirals soaked in syrup.",
    ingredients: ["Maida", "Yogurt", "Sugar", "Saffron", "Oil/Ghee"],
    instructions: ["Ferment batter.", "Fry spirals in hot oil.", "Dip in sugar syrup."]
  },

  // Snack
  {
    name: "Samosa",
    category: "Snack",
    prep_time: "40 min",
    cook_time: "30 min",
    servings: "6",
    calories: 250,
    intro: "Fried pastry filled with spiced potatoes.",
    ingredients: ["Maida", "Potatoes", "Peas", "Cumin", "Spices"],
    instructions: ["Make dough.", "Prepare filling.", "Shape and stuff samosas.", "Deep fry."]
  },
  {
    name: "Pakora",
    category: "Snack",
    prep_time: "15 min",
    cook_time: "20 min",
    servings: "4",
    calories: 200,
    intro: "Vegetable fritters in chickpea flour batter.",
    ingredients: ["Besan (Gram flour)", "Onions/Potatoes", "Spices", "Oil"],
    instructions: ["Make batter.", "Dip veggies in batter.", "Deep fry until golden."]
  },
  {
    name: "Bhel Puri",
    category: "Snack",
    prep_time: "15 min",
    cook_time: "0 min",
    servings: "2",
    calories: 150,
    intro: "Savory snack made of puffed rice and chutneys.",
    ingredients: ["Puffed rice", "Sev", "Onions", "Tomatoes", "Tamarind chutney"],
    instructions: ["Mix all ingredients.", "Toss with chutneys.", "Serve immediately."]
  },
  {
    name: "Vada Pav",
    category: "Snack",
    prep_time: "30 min",
    cook_time: "20 min",
    servings: "4",
    calories: 300,
    intro: "Spicy potato fritter in a bun.",
    ingredients: ["Potatoes", "Besan", "Pav (Buns)", "Garlic chutney", "Green chili"],
    instructions: ["Make batata vada (potato fritter).", "Fry it.", "Serve inside pav with chutneys."]
  },
  {
    name: "Pani Puri",
    category: "Snack",
    prep_time: "30 min",
    cook_time: "10 min",
    servings: "4",
    calories: 150,
    intro: "Hollow crisp balls filled with spiced water.",
    ingredients: ["Puris", "Potatoes", "Chickpeas", "Mint water", "Tamarind water"],
    instructions: ["Prepare flavored waters.", "Mash potato filling.", "Crack puri, fill, and eat whole."]
  },

  // Side
  {
    name: "Cucumber Raita",
    category: "Side",
    prep_time: "10 min",
    cook_time: "0 min",
    servings: "4",
    calories: 80,
    intro: "Cooling yogurt side dish.",
    ingredients: ["Yogurt", "Cucumber", "Cumin powder", "Salt"],
    instructions: ["Whisk yogurt.", "Grate cucumber.", "Mix together with spices."]
  },
  {
    name: "Garlic Naan",
    category: "Side",
    prep_time: "2 hours",
    cook_time: "15 min",
    servings: "4",
    calories: 200,
    intro: "Leavened flatbread with garlic.",
    ingredients: ["Maida", "Yeast/Yogurt", "Garlic", "Butter", "Coriander"],
    instructions: ["Make dough and rest.", "Roll out naan.", "Cook in tandoor or skillet.", "Brush with garlic butter."]
  },
  {
    name: "Jeera Rice",
    category: "Side",
    prep_time: "10 min",
    cook_time: "20 min",
    servings: "4",
    calories: 220,
    intro: "Rice flavored with cumin seeds.",
    ingredients: ["Basmati Rice", "Cumin seeds", "Ghee", "Whole spices"],
    instructions: ["Wash rice.", "Sauté cumin in ghee.", "Add rice and water.", "Cook until fluffy."]
  },
  {
    name: "Mint Chutney",
    category: "Side",
    prep_time: "10 min",
    cook_time: "0 min",
    servings: "6",
    calories: 40,
    intro: "Spicy and fresh dip.",
    ingredients: ["Mint leaves", "Coriander leaves", "Green chilies", "Lemon", "Ginger"],
    instructions: ["Blend all ingredients to a paste.", "Adjust salt and lemon."]
  },
  {
    name: "Papadum",
    category: "Side",
    prep_time: "1 min",
    cook_time: "5 min",
    servings: "4",
    calories: 50,
    intro: "Thin crisp disc.",
    ingredients: ["Papad", "Oil (optional)"],
    instructions: ["Roast on flame or fry in oil."]
  },

  // International
  {
    name: "Creamy Garlic Chicken Pasta",
    category: "Lunch",
    prep_time: "10 min",
    cook_time: "20 min",
    servings: "4",
    calories: 620,
    intro: "A rich, comforting pasta made with tender chicken and garlic cream sauce.",
    ingredients: ["8 oz pasta", "2 chicken breasts", "4 cloves garlic", "Olive oil", "Butter", "Chicken broth", "Heavy cream", "Parmesan", "Lemon juice", "Parsley"],
    instructions: ["Cook pasta al dente.", "Saute chicken until golden.", "Add garlic and cook.", "Add cream and Parmesan, simmer.", "Toss with pasta and serve."]
  },
  {
    name: "Sheet-Pan Chicken Fajitas",
    category: "Dinner",
    prep_time: "10 min",
    cook_time: "20 min",
    servings: "4",
    calories: 460,
    intro: "Quick sheet-pan fajitas with chicken, peppers, and onions—perfect for busy nights.",
    ingredients: ["1 lb chicken breast", "2 bell peppers", "1 onion", "Olive oil", "Chili powder", "Cumin", "Paprika", "Garlic powder", "Tortillas", "Lime"],
    instructions: ["Preheat oven to 425°F.", "Toss chicken and veggies with oil and spices.", "Roast for 18-22 minutes.", "Warm tortillas.", "Serve with lime and cilantro."]
  },
  {
    name: "Veggie Fried Rice",
    category: "Lunch",
    prep_time: "10 min",
    cook_time: "15 min",
    servings: "4",
    calories: 380,
    intro: "Quick fried rice with mixed vegetables and day-old rice. Perfect for leftovers.",
    ingredients: ["3 cups day-old rice", "2 eggs", "1 cup mixed vegetables", "3 green onions", "Garlic", "Soy sauce", "Sesame oil"],
    instructions: ["Scramble eggs and set aside.", "Sauté garlic and veggies.", "Add rice and stir-fry.", "Stir in sauces and eggs.", "Finish with sesame oil."]
  }
];

async function seedDatabase(pool) {
  console.log('Seeding recipes...');
  for (const r of recipes) {
    const id = slugify(r.name) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const query = `
      INSERT INTO recipes 
      (id, name, category, prep_time, cook_time, servings, calories, intro, ingredients, instructions, author, author_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    const ingredientsJson = JSON.stringify(r.ingredients);
    const instructionsJson = JSON.stringify(r.instructions);

    await pool.execute(query, [
      id, r.name, r.category, r.prep_time, r.cook_time, r.servings, r.calories, 
      r.intro, ingredientsJson, instructionsJson, AUTHOR_NAME, AUTHOR_ID
    ]);
    console.log(`Inserted: ${r.name}`);
  }
  console.log('Done inserting recipes.');
}

module.exports = { seedDatabase };

if (require.main === module) {
  (async function() {
    let conn;
    try {
      conn = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        port: process.env.MYSQL_PORT || 3306,
        ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
      });

      console.log('Connected to DB');
      await seedDatabase(conn);
      await conn.end();
    } catch (err) {
      console.error('Seed error:', err);
    }
  })();
}
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
})();
