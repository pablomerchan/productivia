import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CostosProduccionComponent } from '../costos-produccion/costos-produccion.component';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, CostosProduccionComponent],
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent {}
