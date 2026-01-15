-- Fix story texts with clean formatting
-- Remove special characters and ensure proper encoding

-- Unit 1 Stories
UPDATE stories SET text = 'Maria va a una fiesta. En la fiesta hay muchas personas. Maria ve a Juan. Maria dice: "Hola, como te llamas?". Juan responde: "Me llamo Juan, y tu?". Maria dice: "Yo me llamo Maria, mucho gusto". Juan y Maria son amigos ahora.'
WHERE id = 1;

UPDATE stories SET text = 'Hoy es el primer dia de clase. La profesora se llama Ana. Ana dice: "Buenos dias, yo soy la profesora Ana". Los estudiantes dicen: "Buenos dias, profesora". Un estudiante se llama Pedro. Pedro dice: "Hola, me llamo Pedro, soy de Mexico".'
WHERE id = 2;

UPDATE stories SET text = 'Luis entra en un cafe. El camarero dice: "Buenas tardes, que desea?". Luis responde: "Buenas tardes, un cafe por favor". El camarero pregunta: "Como se llama usted?". Luis dice: "Me llamo Luis". El camarero sonrie.'
WHERE id = 3;

-- Unit 2 Stories
UPDATE stories SET text = 'Carlos tiene una familia grande. Su padre se llama Roberto y su madre se llama Elena. Carlos tiene dos hermanos: una hermana que se llama Laura y un hermano que se llama Miguel. Laura tiene diez anos y Miguel tiene cinco anos. La familia de Carlos es muy feliz.'
WHERE id = 4;

UPDATE stories SET text = 'Ana tiene un gato. El gato se llama Michi. Michi es blanco y negro. Michi come pescado y duerme mucho. Ana ama a Michi. Michi es el mejor amigo de Ana. Cada dia, Ana y Michi juegan juntos.'
WHERE id = 5;

UPDATE stories SET text = 'Hay un perro que se llama Toby. Toby no es un perro normal, Toby es medico. Toby tiene una clinica veterinaria. Toby ayuda a muchos animales: gatos, pajaros, conejos. Los animales aman al Doctor Toby. Toby es un heroe.'
WHERE id = 6;

-- Unit 3 Stories
UPDATE stories SET text = 'Pedro va al restaurante. El camarero pregunta: "Que desea comer?". Pedro dice: "Quiero pizza y ensalada, por favor". El camarero pregunta: "Y para beber?". Pedro responde: "Agua, por favor". La comida esta deliciosa. Pedro esta muy feliz.'
WHERE id = 7;

UPDATE stories SET text = 'Maria va al mercado. En el mercado hay muchas frutas: manzanas, naranjas, platanos, fresas. Maria compra cinco manzanas y tres naranjas. Las manzanas cuestan dos euros. Las naranjas cuestan un euro. Maria paga tres euros en total.'
WHERE id = 8;

UPDATE stories SET text = 'Hoy es el cumpleanos de Luis. Luis tiene veinte anos. Hay una fiesta grande. En la fiesta hay un pastel enorme con veinte velas. También hay pizza, refrescos y helado. Luis invita a quince amigos. Todos cantan "Feliz Cumpleanos". Luis esta muy contento.'
WHERE id = 9;

-- Verify the changes
SELECT id, SUBSTRING(text, 1, 100) as text_preview FROM stories WHERE id IN (1,2,3,4,5,6,7,8,9);
