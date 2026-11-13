# ML work area

Put the Python model and inference code used by the FastAPI backend here. Keep HTTP request handling in `app/main.py`; API endpoints can import functions from this package when the model interface is defined.

Before adding a pipeline, decide what the model predicts, which NASA and farm data it uses, and what inputs and outputs the API needs. Training scripts, data preparation, and model artifacts can be organized here once those choices are made. Do not commit large datasets or trained model files without agreeing on how the team will store and reproduce them.
