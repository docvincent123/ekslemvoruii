# Джерела реальних ЕКГ

- **PTB-XL v1.0.3**. Wagner et al., PhysioNet, DOI 10.13026/kfzx-aw45. Індекс 21 799 записів із 100-Гц варіанта. Ліцензія [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Джерело](https://physionet.org/content/ptb-xl/1.0.3/).
- **MIT-BIH Arrhythmia Database v1.0.0**. Moody & Mark, PhysioNet, DOI 10.13026/C2F305. Індекс 48 записів, фрагменти двох каналів із частотою 360 Гц. Ліцензія [ODC-BY 1.0](https://physionet.org/content/mitdb/view-license/1.0.0/). [Джерело](https://physionet.org/content/mitdb/1.0.0/).

PTB-XL підвантажується з PhysioNet за запитом. Для всіх записів MIT-BIH включено перші 10 секунд разом із параметрами калібрування. Сигнали відображаються в мілівольтах. Під час відтворення повторюється вибраний 10-секундний фрагмент. Каталог зберігає лише ідентифікатори записів та коди SCP для PTB-XL. Стартові 24 сигнали PTB-XL перетворено на JSON із округленням до 0.001 мВ, перелік містить `manifest.json`.
