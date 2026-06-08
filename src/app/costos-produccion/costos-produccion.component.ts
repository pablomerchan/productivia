import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostosService, CostoRegistro } from '../services/costos.service';
import Chart from 'chart.js/auto';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

interface CostBreakdown {
  rawMaterials: number;
  laborCost: number;
  indirectCost: number;
  profit: number;
  total: number;
  totalWithProfit: number;
  profitPercent: number;
}

@Component({
  selector: 'app-costos-produccion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './costos-produccion.component.html',
  styleUrls: ['./costos-produccion.component.css']
})
export class CostosProduccionComponent implements OnInit, AfterViewInit {
  @ViewChild('costosChartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('comparisonChartCanvas') comparisonChartCanvas!: ElementRef<HTMLCanvasElement>;

  // Carrusel
  slides: CostoRegistro[] = [];
  currentSlideIndex = 0;
  loadingSlides = false;

  // Diálogo guiado por IA
  dialogActive = false;
  currentStep = 1; // 1 to 6, 7 is finished
  chatHistory: ChatMessage[] = [];
  userInput = '';

  // Voz y dictado
  recognition: any = null;
  recognitionSupported = false;
  listening = false;
  speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Datos recolectados
  productData = {
    name: '',
    materials: '',
    consumption: '',
    laborCost: '',
    indirectCost: '',
    profitAmount: ''
  };

  // Datos de costos desglosados para la gráfica
  costBreakdown: CostBreakdown = {
    rawMaterials: 0,
    laborCost: 0,
    indirectCost: 0,
    profit: 0,
    total: 0,
    totalWithProfit: 0,
    profitPercent: 0
  };

  profitPreviewPercent: number | null = null;

  // Variable para almacenar la instancia de las gráficas
  costChart: Chart | null = null;
  costComparisonChart: Chart | null = null;

  constructor(private costosService: CostosService, private ngZone: NgZone) {}

  ngOnInit(): void {
    this.loadSlides();
    this.initializeSpeechRecognition();
  }

  ngAfterViewInit(): void {
    // La gráfica se generará cuando se complete el diálogo (step 6)
  }

  // Crea (o recrea) una instancia limpia del SpeechRecognition.
  // Se llama también al reiniciar para evitar estados corruptos.
  private buildRecognitionInstance(): any {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    // onresult: se ejecuta fuera de la zona Angular → usar ngZone.run()
    rec.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      this.ngZone.run(() => {
        if (transcript.trim()) {
          this.userInput = transcript.trim();
          console.log('Transcripción capturada:', this.userInput);
        }
        this.listening = false;
      });
    };

    // onerror: también fuera de zona
    rec.onerror = (event: any) => {
      console.error('Error en reconocimiento de voz:', event.error);
      this.ngZone.run(() => {
        this.listening = false;
        // Ignorar el error "no-speech" silenciosamente (usuario no habló)
        if (event.error !== 'no-speech') {
          alert(`Error de voz: ${event.error}. Intenta de nuevo.`);
        }
      });
    };

    // onend: siempre asegurar que listening quede en false
    rec.onend = () => {
      this.ngZone.run(() => {
        this.listening = false;
        console.log('Reconocimiento de voz finalizado.');
      });
    };

    return rec;
  }

  private initializeSpeechRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.recognitionSupported = false;
      console.warn('SpeechRecognition no soportado en este navegador');
      return;
    }

    this.recognitionSupported = true;
    this.recognition = this.buildRecognitionInstance();
  }

  startVoiceInput(): void {
    if (!this.recognitionSupported) {
      alert('Reconocimiento de voz no soportado en tu navegador');
      return;
    }
    if (this.listening) {
      return;
    }

    // Recrear la instancia siempre para evitar estado inválido tras un uso anterior
    this.recognition = this.buildRecognitionInstance();
    if (!this.recognition) return;

    try {
      this.listening = true;
      this.recognition.start();
      console.log('Reconocimiento de voz iniciado...');
    } catch (err) {
      console.error('Error al iniciar reconocimiento de voz:', err);
      this.ngZone.run(() => {
        this.listening = false;
      });
    }
  }

  stopVoiceInput(): void {
    if (!this.recognition || !this.listening) {
      return;
    }
    try {
      this.recognition.stop();
    } catch (err) {
      console.error('Error al detener reconocimiento de voz:', err);
    }
    this.ngZone.run(() => {
      this.listening = false;
    });
  }

  readCurrentQuestion(): void {
    if (!this.speechSupported) {
      return;
    }
    const lastAssistantMessage = [...this.chatHistory].reverse().find(msg => msg.role === 'assistant');
    if (!lastAssistantMessage) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(lastAssistantMessage.text);
    utterance.lang = 'es-ES';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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
      indirectCost: '',
      profitAmount: ''
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

    // Destruir gráfica anterior si existe
    if (this.costChart) {
      this.costChart.destroy();
      this.costChart = null;
    }
    if (this.costComparisonChart) {
      this.costComparisonChart.destroy();
      this.costComparisonChart = null;
    }

    // Resetear datos de costos
    this.costBreakdown = {
      rawMaterials: 0,
      laborCost: 0,
      indirectCost: 0,
      profit: 0,
      total: 0,
      totalWithProfit: 0,
      profitPercent: 0
    };
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
        this.currentStep = 6;
        nextQuestion = `Perfecto. Paso 6: ¿Cuál es el valor de ganancia por unidad que deseas agregar en este producto? (Ingresa el monto en moneda, por ejemplo: $15 o 15). Te mostraré su porcentaje frente al costo total estimado.`;
        break;

      case 6:
        // Guardar ganancia
        this.productData.profitAmount = userAnswer;
        this.currentStep = 7; // Completado

        // Extraer valores numéricos precisamente
        const numLabor = this.extractNumericValue(this.productData.laborCost);
        const numIndirect = this.extractNumericValue(this.productData.indirectCost);
        const rawMatCost = this.estimateRawMaterialCost(this.productData.consumption);
        const profitValue = this.extractNumericValue(this.productData.profitAmount);
        const totalEstimated = rawMatCost + numLabor + numIndirect;
        const totalWithProfit = totalEstimated + profitValue;
        const profitPercent = totalEstimated > 0 ? (profitValue / totalEstimated) * 100 : 0;

        // Guardar datos de costos desglosados para la gráfica
        this.costBreakdown = {
          rawMaterials: rawMatCost,
          laborCost: numLabor,
          indirectCost: numIndirect,
          profit: profitValue,
          total: totalEstimated,
          totalWithProfit: totalWithProfit,
          profitPercent: profitPercent
        };

        // Log para debugging
        console.log('Datos de costos:', {
          materiales: this.productData.materials,
          consumo: this.productData.consumption,
          manoDeObra: this.productData.laborCost,
          indirectos: this.productData.indirectCost,
          ganancia: this.productData.profitAmount,
          calculados: this.costBreakdown
        });

        nextQuestion = `¡Análisis Completado con Éxito! 🎉\n\nAquí tienes el resumen de costos para "${this.productData.name}":\n\n` +
          `• Materias Primas: ${this.productData.materials}\n` +
          `• Consumo por Unidad: ${this.productData.consumption} (Estimado: $${rawMatCost.toFixed(2)})\n` +
          `• Mano de Obra Directa: $${numLabor.toFixed(2)}\n` +
          `• Costos Indirectos: $${numIndirect.toFixed(2)}\n` +
          `• Ganancia: $${profitValue.toFixed(2)} (${profitPercent.toFixed(2)}%)\n\n` +
          `💰 COSTO TOTAL DE PRODUCCIÓN ESTIMADO: $${totalEstimated.toFixed(2)} por unidad.\n` +
          `💸 COSTO TOTAL CON GANANCIA: $${totalWithProfit.toFixed(2)} por unidad.\n` +
          `🛒 PRECIO DE VENTA RECOMENDADO: $${totalWithProfit.toFixed(2)} por unidad.\n\n` +
          `¿Qué te parece este análisis? Puedes iniciar un nuevo análisis cuando lo desees.`;

        // Programar la creación de las gráficas para después de que el DOM se actualice
        setTimeout(() => {
          this.createCostChart();
          this.createComparisonChart();
        }, 500);
        break;
    }

    // Agregar pregunta de IA al chat
    this.chatHistory.push({ role: 'assistant', text: nextQuestion });

    // Guardar pregunta en la base de datos SQLite
    this.costosService.addCosto(`Asistente IA: ${nextQuestion}`, 'pregunta').subscribe({
      next: () => this.loadSlides()
    });
  }

  // Utilidad mejorada para extraer valores numéricos de un texto
  private extractNumericValue(text: string): number {
    if (!text) return 0;

    // Buscar patrones con $ primero: "$50", "$ 50.99", "$50.99"
    const currencyRegex = /\$\s*(\d+(?:[.,]\d{1,2})?)/i;
    const currencyMatch = text.match(currencyRegex);
    if (currencyMatch) {
      return parseFloat(currencyMatch[1].replace(',', '.')) || 0;
    }

    // Buscar patrones numéricos: "50", "50.99", separados por comas o puntos
    const numberRegex = /\d+(?:[.,]\d{1,2})?/g;
    const numbers = text.match(numberRegex);

    if (numbers && numbers.length > 0) {
      // Suma todos los números encontrados (útil si menciona múltiples costos)
      let total = 0;
      numbers.forEach(num => {
        total += parseFloat(num.replace(',', '.'));
      });
      return total;
    }

    return 0;
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

    // Si encontró valores con $, retornar la suma
    if (total > 0) {
      return total;
    }

    // Si no encuentra $, busca números sueltos (cantidad x costo)
    const numbers = consumptionText.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      // Si hay múltiples números, sumarlos todos (ej: "2 metros a $5" = 2 + 5 = 7, o si dice "costo total $100" = 100)
      let sum = 0;
      numbers.forEach(num => {
        sum += parseFloat(num);
      });
      return sum > 0 ? sum : 15; // Retorna suma o valor por defecto
    }

    return 15; // Valor por defecto simulado
  }

  // Cálculo dinámico de ganancia en porcentaje frente al costo total estimado
  updateProfitPreview(): void {
    if (this.currentStep !== 6) {
      this.profitPreviewPercent = null;
      return;
    }

    const profitValue = this.extractNumericValue(this.userInput);
    if (!this.userInput || profitValue <= 0) {
      this.profitPreviewPercent = null;
      return;
    }

    const baseCost =
      this.estimateRawMaterialCost(this.productData.consumption) +
      this.extractNumericValue(this.productData.laborCost) +
      this.extractNumericValue(this.productData.indirectCost);

    this.profitPreviewPercent = baseCost > 0
      ? parseFloat(((profitValue / baseCost) * 100).toFixed(2))
      : null;
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

  // Crear gráfica de barras con los costos desglosados
  private createCostChart(): void {
    // Destruir gráfica anterior si existe
    if (this.costChart) {
      this.costChart.destroy();
    }

    // Obtener el canvas del DOM
    if (!this.chartCanvas) {
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    // Crear la gráfica de barras
    this.costChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Materias Primas', 'Mano de Obra', 'Costos Indirectos', 'Ganancia'],
        datasets: [
          {
            label: 'Costo ($)',
            data: [
              this.costBreakdown.rawMaterials,
              this.costBreakdown.laborCost,
              this.costBreakdown.indirectCost,
              this.costBreakdown.profit
            ],
            backgroundColor: [
              'rgba(54, 162, 235, 0.8)',  // Azul para materias primas
              'rgba(255, 159, 64, 0.8)',   // Naranja para mano de obra
              'rgba(75, 192, 192, 0.8)',   // Verde para costos indirectos
              'rgba(255, 99, 132, 0.8)'    // Rojo para ganancia
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(255, 159, 64, 1)',
              'rgba(75, 192, 192, 1)',
              'rgba(255, 99, 132, 1)'
            ],
            borderWidth: 2,
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 6,
            bottom: 6,
            left: 6,
            right: 6
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              font: {
                size: 12,
                weight: 'bold'
              },
              padding: 15,
              usePointStyle: true
            }
          },
          title: {
            display: true,
            text: `Desglose de Costos - ${this.productData.name}`,
            font: {
              size: 14,
              weight: 'bold'
            },
            padding: 20
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: {
              size: 12,
              weight: 'bold'
            },
            bodyFont: {
              size: 11
            },
            displayColors: true,
            callbacks: {
              label: function(context) {
                const value = context.parsed?.y;
                return `$${value ? value.toFixed(2) : '0.00'}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: '0%',
            ticks: {
              callback: function(value) {
                return '$' + (value as number).toFixed(2);
              },
              font: {
                size: 11
              }
            },
            title: {
              display: true,
              text: 'Cantidad ($)',
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          },
          x: {
            ticks: {
              font: {
                size: 11
              }
            }
          }
        }
      }
    });
  }

  // Crear gráfica comparativa de costo total vs precio de venta
  private createComparisonChart(): void {
    if (this.costComparisonChart) {
      this.costComparisonChart.destroy();
    }

    if (!this.comparisonChartCanvas) {
      return;
    }

    const ctx = this.comparisonChartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    this.costComparisonChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Costo Total', 'Precio de Venta'],
        datasets: [
          {
            label: 'Monto ($)',
            data: [
              this.costBreakdown.total,
              this.costBreakdown.totalWithProfit
            ],
            backgroundColor: [
              'rgba(96, 165, 250, 0.85)',
              'rgba(16, 185, 129, 0.85)'
            ],
            borderColor: [
              'rgba(96, 165, 250, 1)',
              'rgba(16, 185, 129, 1)'
            ],
            borderWidth: 2,
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 6,
            bottom: 6,
            left: 6,
            right: 6
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              font: {
                size: 12,
                weight: 'bold'
              },
              padding: 15,
              usePointStyle: true
            }
          },
          title: {
            display: true,
            text: 'Comparación: Costo Total vs Precio de Venta',
            font: {
              size: 14,
              weight: 'bold'
            },
            padding: 20
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: {
              size: 12,
              weight: 'bold'
            },
            bodyFont: {
              size: 11
            },
            displayColors: true,
            callbacks: {
              label: function(context) {
                const value = context.parsed?.y;
                return `$${value ? value.toFixed(2) : '0.00'}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: '0%',
            ticks: {
              callback: function(value) {
                return '$' + (value as number).toFixed(2);
              },
              font: {
                size: 11
              }
            },
            title: {
              display: true,
              text: 'Monto ($)',
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          },
          x: {
            ticks: {
              font: {
                size: 11
              }
            }
          }
        }
      }
    });
  }
}
