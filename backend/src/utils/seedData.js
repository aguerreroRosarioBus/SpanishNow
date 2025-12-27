require('dotenv').config();
const { User, Course, Unit, Story, Vocabulary, Question, Enrollment } = require('../models');
const sequelize = require('../config/database');

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed de datos de prueba...');

    // Crear usuarios de prueba
    console.log('👤 Creando usuarios...');

    const teacher = await User.create({
      name: 'Profesor Demo',
      email: 'profesor@demo.com',
      password: 'demo123', // Se hasheará automáticamente
      role: 'teacher'
    });

    const student = await User.create({
      name: 'Estudiante Demo',
      email: 'estudiante@demo.com',
      password: 'demo123',
      role: 'student'
    });

    console.log('✅ Usuarios creados');

    // Crear curso de ejemplo
    console.log('📚 Creando curso...');

    const course = await Course.create({
      title: 'Español Básico - Nivel A1',
      description: 'Aprende español desde cero con historias interesantes y fáciles de entender. Curso diseñado con el método TPRS.',
      level: 'A1',
      teacherId: teacher.id
    });

    console.log('✅ Curso creado');

    // Crear unidades
    console.log('📖 Creando unidades...');

    const unit1 = await Unit.create({
      courseId: course.id,
      title: 'Presentaciones y Saludos',
      description: 'Aprende a saludarte y presentarte en español',
      order: 1
    });

    const unit2 = await Unit.create({
      courseId: course.id,
      title: 'La Familia',
      description: 'Vocabulario sobre la familia y relaciones',
      order: 2
    });

    console.log('✅ Unidades creadas');

    // Crear historias
    console.log('📝 Creando historias...');

    await Story.create({
      unitId: unit1.id,
      title: 'Mi nombre es María',
      text: `Hola. Mi nombre es María. Yo soy de México.

Yo tengo 25 años. Yo vivo en la Ciudad de México.

Me gusta el café. También me gusta la música.

¿Y tú? ¿Cómo te llamas?`,
      order: 1
      // audioSlowUrl y audioNormalUrl se dejan null por ahora
    });

    await Story.create({
      unitId: unit1.id,
      title: 'En el café',
      text: `María va al café. Ella ve a un amigo.

"¡Hola Juan!" dice María.

"¡Hola María! ¿Cómo estás?" pregunta Juan.

"Estoy bien, gracias. ¿Y tú?" responde María.

"Muy bien. ¿Quieres un café?" pregunta Juan.

"Sí, gracias" dice María.`,
      order: 2
    });

    await Story.create({
      unitId: unit2.id,
      title: 'La familia de Pedro',
      text: `Pedro tiene una familia grande.

Él tiene un padre y una madre. Su padre se llama José. Su madre se llama Ana.

Pedro también tiene dos hermanos. Su hermano mayor se llama Carlos. Su hermana menor se llama Sofía.

Pedro ama a su familia. Ellos viven en una casa grande.`,
      order: 1
    });

    await Story.create({
      unitId: unit2.id,
      title: 'La fiesta familiar',
      text: `Hoy es domingo. La familia de Pedro tiene una fiesta.

Los abuelos llegan primero. El abuelo se llama Roberto. La abuela se llama Carmen.

Después llegan los tíos. Tío Miguel y tía Laura traen comida deliciosa.

Todos están felices. Es un día especial para la familia.`,
      order: 2
    });

    console.log('✅ Historias creadas');

    // Crear vocabulario para la unidad 1
    console.log('📚 Creando vocabulario...');

    const vocabWords = [
      { unitId: unit1.id, word: 'Hola', translation: 'Hello', order: 1 },
      { unitId: unit1.id, word: 'Nombre', translation: 'Name', order: 2 },
      { unitId: unit1.id, word: 'Años', translation: 'Years (age)', order: 3 },
      { unitId: unit1.id, word: 'Vivo', translation: 'I live', order: 4 },
      { unitId: unit1.id, word: 'Me gusta', translation: 'I like', order: 5 },
      { unitId: unit2.id, word: 'Familia', translation: 'Family', order: 1 },
      { unitId: unit2.id, word: 'Padre', translation: 'Father', order: 2 },
      { unitId: unit2.id, word: 'Madre', translation: 'Mother', order: 3 },
      { unitId: unit2.id, word: 'Hermano', translation: 'Brother', order: 4 },
      { unitId: unit2.id, word: 'Casa', translation: 'House', order: 5 }
    ];

    await Vocabulary.bulkCreate(vocabWords);

    console.log('✅ Vocabulario creado');

    // Inscribir al estudiante en el curso
    console.log('📝 Inscribiendo estudiante en el curso...');

    await Enrollment.create({
      studentId: student.id,
      courseId: course.id
    });

    console.log('✅ Estudiante inscrito');

    console.log('\n🎉 Seed completado exitosamente!\n');
    console.log('📧 Credenciales de prueba:');
    console.log('   Profesor: profesor@demo.com / demo123');
    console.log('   Estudiante: estudiante@demo.com / demo123\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  }
}

// Ejecutar seed
seedDatabase();
