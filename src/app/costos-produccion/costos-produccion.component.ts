import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostosService, CostoRegistro } from '../services/costos.service';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

@Component({
  selector: 'app-costos-produccion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './costos-produccion.component.html',
  styleUrls: ['./costos-produccion.component.css']
})
export class CostosProduccionComponent implements OnInit {
  // Carrusel
  slides: CostoRegistro[] = [];
  currentSlideIndex = 0;
  loadingSlides = false;

  // Diálogo guiado por IA
  dialogActive = false;
  currentStep = 1; // 1 to 5, 6 is finished
  chatHistory: ChatMessage[] = [];
  userInput = '';

  // Datos recolectados
  productData = {
    name: '',
    materials: '',
    consumption: '',
    laborCost: '',
    indirectCost: ''
  };

  constructor(private costosService: CostosService) {}

  ngOnInit(): void {
    this.loadSlides();
  }

  // Carga todas las diapositivas de la base de datos
  loadSlides(): void {
    this.loadingSlides = true;
    this.costosService.getCostos().subscribe({
      next: (data) => {
        this.slides = data;
        // Si el índice actual ya no existe, resetea a 0
        if (this.currentSlideIndex >= this.slides.length) {
          this.currentSlideIndex = 0;
        }
        this.loadingSlides = false;
      },
      error: (err) => {
        console.error('Error al cargar diapositivas:', err);
        this.loadingSlides = false;
      }
    });
  }

  // Navegación y formulario manual de carrusel eliminados

  // Iniciar flujo de diálogo IA
  startDialog(): void {
    this.dialogActive = true;
    this.currentStep = 1;
    this.chatHistory = [];

    // Limpiar datos anteriores
    this.productData = {
      name: '',
      materials: '',
      consumption: '',
      laborCost: '',
      indirectCost: ''
    };

    const firstQuestion = '¡Hola! Soy tu Asistente de Costos de IA. Comencemos con el Paso 1: ¿Qué producto deseas costear hoy?';
    this.chatHistory.push({ role: 'assistant', text: firstQuestion });

    // Guardar pregunta inicial en SQLite
    this.costosService.addCosto(firstQuestion, 'pregunta').subscribe({
      next: () => this.loadSlides()
    });
  }

  // Detener o reiniciar diálogo
  resetDialog(): void {
    this.dialogActive = false;
    this.currentStep = 1;
    this.chatHistory = [];
  }

  // Enviar respuesta en el diálogo guiado
  sendResponse(): void {
    const text = this.userInput.trim();
    if (!text) return;

    // Agregar respuesta del usuario al chat
    this.chatHistory.push({ role: 'user', text: text });
    this.userInput = '';

    // Guardar respuesta del usuario en SQLite
    this.costosService.addCosto(`Respuesta: ${text}`, 'respuesta').subscribe({
      next: () => this.loadSlides()
    });

    // Procesar según el paso actual
    setTimeout(() => {
      this.processStep(text);
    }, 600);
  }

  // Lógica de procesamiento de pasos
  private processStep(userAnswer: string): void {
    let nextQuestion = '';

    switch (this.currentStep) {
      case 1:
        // Guardar nombre del producto
        this.productData.name = userAnswer;
        this.currentStep = 2;
        nextQuestion = `Perfecto, vamos a costear el producto "${userAnswer}". Paso 2: ¿Qué materias primas o materiales principales requieres para su elaboración?`;
        break;

      case 2:
        // Guardar materias primas
        this.productData.materials = userAnswer;
        this.currentStep = 3;
        nextQuestion = `Entendido. Ahora, Paso 3: ¿Cuánto consumes de cada materia prima por unidad de producto? (Indica cantidad y costo unitario estimado si los tienes, por ejemplo: 2 metros a $5 c/u).`;
        break;

      case 3:
        // Guardar consumo
        this.productData.consumption = userAnswer;
        this.currentStep = 4;
        nextQuestion = `Excelente. Paso 4: ¿Cuál es el costo de mano de obra directa para producir una unidad de "${this.productData.name}"? (Por ejemplo: horas trabajadas multiplicadas por la tarifa por hora, o costo por pieza fabricada).`;
        break;

      case 4:
        // Guardar mano de obra
        this.productData.laborCost = userAnswer;
        this.currentStep = 5;
        nextQuestion = `Ya casi lo logramos. Paso 5: ¿Cuáles son los costos indirectos de fabricación asociados por unidad? (Servicios públicos, depreciación de herramientas, empaques, alquiler del local, etc.).`;
        break;

      case 5:
        // Guardar costos indirectos
        this.productData.indirectCost = userAnswer;
        this.currentStep = 6; // Completado

        // Calcular si es posible un resumen numérico
        const numLabor = parseFloat(this.productData.laborCost.replace(/[^0-9.]/g, '')) || 0;
        const numIndirect = parseFloat(this.productData.indirectCost.replace(/[^0-9.]/g, '')) || 0;

        // Intentar parsear costo de materias primas del texto si es simple
        let matCostMsg = '';
        const rawMatCost = this.estimateRawMaterialCost(this.productData.consumption);
        const totalEstimated = rawMatCost + numLabor + numIndirect;

        nextQuestion = `¡Análisis Completado con Éxito! 🎉\n\nAquí tienes el resumen de costos para "${this.productData.name}":\n\n` +
          `• Materias Primas: ${this.productData.materials}\n` +
          `• Consumo por Unidad: ${this.productData.consumption} (Estimado: $${rawMatCost.toFixed(2)})\n` +
          `• Mano de Obra Directa: $${numLabor.toFixed(2)}\n` +
          `• Costos Indirectos: $${numIndirect.toFixed(2)}\n\n` +
          `💰 COSTO TOTAL DE PRODUCCIÓN ESTIMADO: $${totalEstimated.toFixed(2)} por unidad.\n\n` +
          `¿Qué te parece este análisis? Puedes iniciar un nuevo análisis cuando lo desees.`;
        break;
    }

    // Agregar pregunta de IA al chat
    this.chatHistory.push({ role: 'assistant', text: nextQuestion });

    // Guardar pregunta en la base de datos SQLite
    this.costosService.addCosto(`Asistente IA: ${nextQuestion}`, 'pregunta').subscribe({
      next: () => this.loadSlides()
    });
  }

  // Utilidad de simulación para parsear costo de materias primas
  private estimateRawMaterialCost(consumptionText: string): number {
    // Buscar patrones como "$5", "5 dólares", "$ 5.50"
    const regex = /(?:\$)\s*(\d+(?:\.\d+)?)/g;
    let match;
    let total = 0;
    let count = 0;

    while ((match = regex.exec(consumptionText)) !== null) {
      total += parseFloat(match[1]);
      count++;
    }

    // Si no encuentra $, busca números sueltos y asume uno
    if (total === 0) {
      const numbers = consumptionText.match(/\d+(?:\.\d+)?/g);
      if (numbers && numbers.length > 0) {
        // Tomar el último número mencionado como posible costo
        return parseFloat(numbers[numbers.length - 1]) || 10;
      }
      return 15; // Valor por defecto simulado
    }

    return total;
  }

  // Limpiar base de datos y reiniciar carrusel
  clearDatabase(): void {
    if (confirm('¿Estás seguro de que deseas limpiar todo el historial de la base de datos SQLite?')) {
      this.costosService.clearDatabase().subscribe({
        next: () => {
          this.loadSlides();
          this.resetDialog();
        },
        error: (err) => console.error('Error al resetear la base de datos:', err)
      });
    }
  }
}
