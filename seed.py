import os
from app import app, db, Question, User
from werkzeug.security import generate_password_hash

# 1. A simple, easy-to-explain list of sample questions
SAMPLE_QUESTIONS = [
    {
        "subject": "Web Frontend",
        "module_type": "Theory",
        "round_number": 1,
        "question_text": "What does HTML stand for?",
        "options": ["Hyper Text Markup Language", "High Text Machine Language", "Hyper Tool Markup Language", "None of these"],
        "answer_index": 0
    },
    {
        "subject": "Web Backend",
        "module_type": "Theory",
        "round_number": 1,
        "question_text": "Which of the following is a Python web framework?",
        "options": ["React", "Flask", "Angular", "Vue"],
        "answer_index": 1
    },
    {
        "subject": "DBMS",
        "module_type": "Lab",
        "round_number": 1,
        "question_text": "Which SQL command is used to retrieve data?",
        "options": ["INSERT", "UPDATE", "DELETE", "SELECT"],
        "answer_index": 3
    }
]

def seed_database():
    with app.app_context():
        # Create database tables based on models in app.py
        db.create_all()

        # 2. Insert sample questions only if the table is empty
        if Question.query.count() == 0:
            for q_data in SAMPLE_QUESTIONS:
                question = Question(**q_data)
                db.session.add(question)
            print(f"Added {len(SAMPLE_QUESTIONS)} sample questions to the database.")
        else:
            print("Questions already exist in the database. Skipping question setup.")

        # 3. Create a default admin account securely
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@bytewise.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "AdminPass123!")
        
        if User.query.filter_by(email=admin_email).first() is None:
            admin_user = User(
                name="System Admin",
                email=admin_email,
                password_hash=generate_password_hash(admin_password),
                role="admin"
            )
            db.session.add(admin_user)
            print("Admin account created successfully.")
        
        # Save all changes to the database
        db.session.commit()
        print("Database setup complete!")

if __name__ == "__main__":
    seed_database()