import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashBoardGeneral } from './dash-board-general';

describe('DashBoardGeneral', () => {
  let component: DashBoardGeneral;
  let fixture: ComponentFixture<DashBoardGeneral>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashBoardGeneral]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashBoardGeneral);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
